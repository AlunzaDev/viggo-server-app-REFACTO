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

Al terminar #55 se repite esta medición con la misma base y se agregan aquí los números.

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
