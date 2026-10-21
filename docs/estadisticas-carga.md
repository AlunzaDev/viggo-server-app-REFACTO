# Estadísticas con volumen real: medición y decisión (#52)

Medición de las consultas de estadísticas (`docs/estadisticas.md`) con el volumen esperado, para decidir si bastan las consultas directas o hacen falta totales precalculados (§2 punto 5 y §7 del ADR).

**Resultado:** las consultas directas **no** cumplen los objetivos. Se implementan totales precalculados por sede y hora (#55).

## 1. Datos de carga

Generados con `scripts/statistics-load/seed.sql`. Es reproducible: mismos parámetros y semilla, mismos datos. Solo corre en una base cuyo nombre termina en `_load`.

```
createdb viggo_administrativo_load
DATABASE_URL=.../viggo_administrativo_load npx prisma migrate deploy
psql -d viggo_administrativo_load -v sedes=120 -v dias=180 -v semilla=0.42 -f scripts/statistics-load/seed.sql
```

| | Medido |
|---|---|
| Sedes | 120 (1 de cada 10 de alto movimiento, 2 zonas horarias además de CDMX, 1 de cada 10 sin capacidad) |
| Historia | 180 días |
| Tickets (`operational_tickets`) | 18.3 M, 14 GB; mediana 701 por sede al día, máximo 2,511 |
| Pagos de OPERATIVO (`operational_payments`) | 17.1 M, 15 GB (85 % efectivo, 15 % tarjeta) |
| Pagos de la nube (`payments`) | 2.6 M, 1.3 GB (los de tarjeta, también presentes en OPERATIVO) |
| Movimientos de pensionados | 1.2 M |
| Base completa | 31 GB; generada en 1 h 25 min |

La distribución sigue la de cobrocaja (ADR §7). Se generaron 6 meses y no 18 porque los 18 meses ocupan unos 95 GB y tardan más de 6 horas en una laptop. Con 6 meses ya se ve el problema: las consultas recorren todo el histórico, así que con 18 meses solo empeoraría.

## 2. Hardware de referencia

Laptop de desarrollo, no un servidor:

- Intel i7-1185G7 (4 núcleos, 8 hilos), 16 GB de RAM, SSD.
- Docker Desktop con 8 CPU y 8 GB.
- PostgreSQL 17 con la configuración por defecto de la imagen (`shared_buffers` 128 MB, `work_mem` 4 MB), mientras corrían los 4 sistemas de desarrollo.

Un servidor con PostgreSQL ajustado sería más rápido, pero no cambia el orden de magnitud de §3: el problema es cuántas filas se leen, no la máquina.

## 3. Resultados

Medidos con `scripts/statistics-load/measure.ts`:

- `--explain`: el plan y el tiempo real de cada métrica, una por una.
- Sin opción: los escenarios del ADR, con 10 consultas simultáneas mientras se ingieren eventos en el inbox.

### Cada métrica sola (`EXPLAIN ANALYZE`)

| Métrica | 1 sede, 30 días | 120 sedes, 30 días |
|---|---|---|
| `ingresos.netos` (total, por día y por método) | **320 – 513 s** | **229 – 329 s** |
| `tickets.entradas` por hora | 0.10 s | 10.1 s |
| `tickets.estancia` | 0.47 s | 24.5 s |
| `tickets.ticket_promedio` | 0.01 s | 4.9 s |
| `operacion.autos_dentro` | 0.04 s | 14.2 s |
| `ingresos.netos` por día, 12 meses, 120 sedes | — | **337 s** |

Objetivos del ADR: 1 sede ≤ 300 ms, consolidado de 30 días ≤ 1.5 s y consolidado de 12 meses ≤ 3 s, todos en p95.

### Con 10 consultas simultáneas

Con el dashboard de 1 sede, a los pocos segundos varias métricas de ingresos se cancelaron por el `statement_timeout` de 15 s. Después, las 10 conexiones del pool quedaron ocupadas con consultas lentas y la ingestión de eventos (lo que recibe la nube de cada OPERATIVO) no consiguió conexión: `timeout exceeded when trying to connect`.

O sea: **unos cuantos usuarios mirando el dashboard detendrían la sincronización de los estacionamientos.**

## 4. Por qué

- **Ingresos.** `statistics_payments` (ADR §4.1) une los pagos de la nube y los de OPERATIVO sin duplicar el mismo cobro. El periodo de cada sede se calcula en su zona horaria (`scope`), y por eso el filtro por fecha es un join y no una constante. PostgreSQL no lo lleva a los índices a través de la vista: en cada consulta recorre los 17 M de pagos de OPERATIVO y los 2.6 M de la nube.
  - Se probó reescribir la vista sin `DISTINCT ON` y con índices por `paid_at` y `refunded_at`. Fue peor: 1,330 s para 1 sede, porque el plan siguió recorriendo todo y además agregó una búsqueda por fila. Se descartó.
- **Tickets.** Para 1 sede usan bien el índice (sede, fecha). Para las 120, 30 días son unos 3 M de filas que se agregan en cada consulta. `tickets.estancia` además recorre la tabla completa (9 GB). Agregar millones de filas en cada petición no llega a 1.5 s, y menos con concurrencia.

## 5. Decisión

**Totales precalculados por sede y hora local** (#55): una tabla `statistics_hourly` con lo que suman las métricas (cobrado y reembolsado por método y tipo, entradas, salidas y estancias).

- **Volumen:** 120 sedes × 24 horas son unas 2,900 filas al día, frente a ~100 mil tickets más sus pagos. Un consolidado de 12 meses lee ~1 M de filas pequeñas en vez de recorrer 35 M.
- **Se mantiene sola:** el procesador del inbox y los pagos de la nube marcan como pendiente la hora y la sede que cambian, y un proceso periódico recalcula solo esas horas desde las tablas de origen. Así, un reembolso días después solo recalcula su hora.
- **La hora en curso** se sigue calculando en vivo, para que el dashboard no se atrase.
- **Las mismas reglas** del ADR (§3–§4) siguen valiendo: la tabla guarda las cifras ya calculadas con ellas. Las pruebas de #55 deben comprobar que coinciden con el cálculo directo.

### Cómo quedó (#55)

**Tablas:**
- `statistics_hourly_payments`: por sede, hora, movimiento (cobro o reembolso), método y tipo; con monto y número de pagos.
- `statistics_hourly_tickets`: por sede y hora. Guarda entradas, salidas, pagados con su monto y las estancias que terminaron en esa hora: número, minutos totales, un histograma de 18 rangos con los minutos de cada rango, e ingresos por rango del dashboard.

**Cómo se leen.** Las métricas suman las horas completas ya pasadas desde las tablas y calculan en vivo solo lo demás (`hourlyScope` en `statistics-sql.ts`):
- los minutos sueltos al inicio y al final del periodo;
- la hora en curso.

Son como mucho unas 2 horas por sede. El cálculo en vivo y el recálculo usan las mismas consultas (`hourly-sql.ts`): cada ventana de tiempo se lee con límites reales, así que sí usa los índices.

**Cómo se mantienen:**
- El procesador del inbox marca como pendientes las horas que cambia cada ticket o pago de OPERATIVO, la hora anterior y la nueva. En un pago marca también las de las otras filas del mismo cobro.
- Un proceso del servidor cada 30 s marca las horas de los pagos de la nube que cambiaron (por `updated_at`, revisando de nuevo los últimos 2 minutos) y recalcula las horas pendientes.
- Las horas pendientes se bloquean mientras se recalculan, así que un cambio que llega en ese momento las vuelve a marcar y no se pierde.

**Supuestos y aproximaciones:**
- **Horas UTC.** En México todas las zonas tienen offsets de horas completas, así que cada hora UTC es una hora local completa y un día local son 24 de esas horas. Una zona con offset de media hora necesitaría guardar por cuartos de hora.
- **Retraso.** Una hora pasada que cambia, por ejemplo por un reembolso o un pago que llega tarde, se refleja en menos de un minuto.
- **Mediana de estancia.** Es el promedio de las estancias del rango del histograma donde cae la estancia de en medio. Es exacta con pocas estancias y queda dentro de su rango (15 minutos en la primera hora) con muchas. El promedio y los conteos por rango siguen siendo exactos.

**Al migrar:** la migración marca como pendientes todas las horas con datos, y el servidor las va calculando de 200 en 200. En una base con mucho histórico es más rápido `npm run statistics:rebuild`, que reconstruye por sede y por semanas. También sirve para reparar un periodo (`--desde`, `--hasta`, `--proyectos`).

**Autos dentro** (`operacion.autos_dentro` y `operacion.ocupacion`) también leía 7 días de tickets y 30 de movimientos de pensión por sede. Ahora lee solo los tickets sin salida, con su índice parcial, y el último movimiento de cada pase.

### Resultado con los totales por hora (#55)

Misma base, mismo hardware (§2). Reconstruir los totales tardó 36 minutos (`npm run statistics:rebuild`); ocupan 438 MB frente a 31 GB de origen.

**Cada métrica sola** (`EXPLAIN ANALYZE`, sin JIT, caché caliente). Los rangos son la variación entre corridas en esta laptop:

| Métrica | 1 sede, 30 días | 120 sedes, 30 días | Antes, 120 sedes |
|---|---|---|---|
| `ingresos.netos` | 4 – 10 ms | 0.65 – 2 s | 229 – 329 s |
| `tickets.entradas` | 5 ms | 0.6 – 1.1 s | 10 s |
| `tickets.estancia` | 5 ms | 0.8 – 1.9 s | 24 s |
| `tickets.ticket_promedio` | 2 ms | 0.1 – 0.5 s | 5 s |
| `operacion.autos_dentro` | 10 ms | 0.9 – 1.4 s | 14 s |
| `ingresos.netos` por día, 12 meses | — | 3.6 – 5.7 s | 337 s |

**Escenarios del ADR** (`measure.ts`):

| Escenario | 1 petición a la vez (p50) | 10 simultáneas (p95) | Meta (p95) |
|---|---|---|---|
| Dashboard de 1 sede, 30 días | 0.3 – 0.36 s | 1.8 s | 0.3 s |
| Dashboard de 120 sedes, 30 días | 3 – 6 s | 15 – 27 s | 1.5 s |
| Consolidado por día, 12 meses | 3.7 – 11 s | 11 – 22 s | 3 s |

Con 10 simultáneas ya no se agota el pool y la ingestión sigue funcionando: falla a lo más el 10 % de sus eventos en el escenario de 12 meses, que se reintentan. Antes la medición ni siquiera terminaba.

En esta laptop **todavía no se cumplen las metas** de 120 sedes ni la de 1 sede con concurrencia. Con todas las sedes, cada métrica suma cientos de miles de filas por hora; el PostgreSQL de Docker tiene 128 MB de caché para una tabla de 438 MB; y la máquina comparte recursos con los sistemas de desarrollo. Lo que sigue:

1. Medir en el servidor real o con PostgreSQL configurado como producción (`shared_buffers`, `work_mem`).
2. Totales por día además de por hora, para que los periodos de días completos lean 24 veces menos filas. Es el siguiente issue.

Ajustes que salieron de esta medición, ya aplicados:
- `OFFSET 0` en cada lectura por sede (`LATERAL`): sin él, PostgreSQL la aplanaba y recorría la tabla completa.
- `jit = off` en las transacciones de estadísticas: el JIT tardaba 4 s en compilar consultas que corren en 0.6 s.
- Suma por sede y hora antes de calcular el día local.
- Leer la tabla horaria sede por sede resultó más lento que leerla completa una vez con esta caché, así que se dejó el join.

## 6. Cómo repetir la medición

```
# Planes y tiempo de cada métrica (sin concurrencia)
DATABASE_URL=.../viggo_administrativo_load npx tsx scripts/statistics-load/measure.ts --explain

# Escenarios del ADR: 20 ejecuciones, 10 simultáneas, pool de 10, con ingestión a la vez
DATABASE_URL=.../viggo_administrativo_load npx tsx scripts/statistics-load/measure.ts --runs 20 --concurrency 10
```

La segunda reporta por escenario:

- p50, p95, p99 y el máximo;
- la memoria máxima de Node y las conexiones máximas;
- el p95 de la ingestión y cuántos eventos fallaron;
- cuántas respuestas salieron parciales (alguna métrica pasó de 15 s) o fallaron.
