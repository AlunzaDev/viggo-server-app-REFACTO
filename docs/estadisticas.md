# Estadísticas y reportes (ADR)

Estado: **aceptado como diseño** (#47, epic #26). Implementación en #48–#52 y #54.

## 1. Contexto

ADMINISTRATIVO muestra indicadores de 100+ estacionamientos. La operación física es de cada OPERATIVO; la nube recibe sus filas por outbox/inbox y las guarda como copias de solo lectura (`operational_*`). Los cobros de la app con Stripe, las pensiones y las órdenes externas nacen en la nube (`payments`, `external_payment_orders`).

El `/api/dashboard` actual trae a Node todos los pagos y tickets del rango (y del periodo anterior) y los suma en memoria, leyendo cada dato del JSON del espejo. Con 100+ sedes y meses de historia la memoria y el tiempo crecen con el histórico completo, y agregar una métrica obliga a tocar una sola función de 130 líneas.

## 2. Decisión

1. **Se agrega en PostgreSQL, no en Node.** Cada métrica es una consulta SQL que devuelve el resultado ya agregado (sumas, conteos, series, distribuciones). Node solo valida filtros, ejecuta y da formato. Ninguna consulta trae filas de detalle sin límite.
2. **Columnas tipadas en los espejos (#48).** El procesador del inbox copia a columnas reales los datos que se filtran o suman (fechas, montos, estado, método). Las consultas no castean el JSON en cada fila y pueden usar índices.
3. **Una sola fuente canónica de pagos (#49).** Una vista une los pagos de la nube y los del espejo operativo sin contar dos veces el mismo cobro (§4.1).
4. **Métricas como piezas independientes (#50).** Cada una declara su definición, su consulta y sus pruebas, y se registra en un catálogo. Agregar una no modifica las demás ni la infraestructura común.
5. **Sin agregados precalculados por ahora.** Primero se mide con datos de carga (#52). Solo si las consultas directas no cumplen los objetivos (§7) se agregan tablas por hora/día o vistas materializadas, con su recomputación documentada.

Capas, siguiendo las convenciones del proyecto:

| Capa | Contenido |
|---|---|
| `domain/statistics` | Definición de métricas, tipos de resultado, reglas de periodo y zona, puerto de lectura (`MetricsReader`). Sin Express ni Prisma. |
| `presentation/services/statistics` | Caso de uso: valida filtros, aplica el alcance de proyectos del usuario, ejecuta las métricas pedidas. |
| `infrastructure/statistics` | Una consulta SQL parametrizada por métrica (`Prisma.sql`), vistas e índices por migración. |
| `presentation/routes/statistics` | HTTP: parseo de filtros, permisos, serialización. |

## 3. Reglas comunes

- **Periodo `[inicio, fin)`**, medio abierto: un evento exactamente en `fin` pertenece al periodo siguiente. El comparativo es el periodo inmediato anterior de la misma duración.
- **Zona horaria por proyecto** (`proyectos.zona_horaria`, #53). Días, horas pico y "hoy" se calculan en la zona de cada sede con `AT TIME ZONE`.
  - Un rango pedido por fechas ("del 1 al 15") se convierte a instantes **en la zona de cada sede**.
  - El consolidado de varias sedes suma esos periodos locales y la respuesta indica `zonasMezcladas: true` si las sedes no comparten zona. Las series por hora de un consolidado se agrupan por hora local de cada sede.
- **Dinero** en `numeric(12,2)` dentro de PostgreSQL y serializado como texto decimal (`"1250.50"`) con su `currency`. Nunca se suman monedas distintas: cada total va por moneda. Hoy todo es `MXN`.
- **Estados de un valor** (todas las métricas):

| Estado | Significado | Ejemplo |
|---|---|---|
| `ok` | valor calculado, puede ser 0 | ingresos $0 en un día sin cobros |
| `sin_datos` | la sede no tiene observaciones en el periodo | promedio de estancia sin salidas |
| `no_disponible` | la métrica no aplica a la sede | ocupación sin capacidad capturada |
| `error` | la consulta falló | — |

  Un consolidado nunca muestra un total como completo si alguna sede está en `error`; lo marca como parcial y dice cuáles faltan.

## 4. Catálogo inicial

Cada métrica lleva un identificador estable. Dimensiones permitidas: `proyecto`, `dia`, `hora`, `metodo`, `tipo`.

| Id | Definición | Fuente | Unidad |
|---|---|---|---|
| `ingresos.confirmados` | Suma de pagos `succeeded` con `paid_at` en el periodo, menos lo reembolsado de esos mismos pagos | vista canónica (§4.1) | dinero |
| `ingresos.reembolsos` | Suma de pagos `refunded` cuyo cobro original cae en el periodo | vista canónica | dinero |
| `ingresos.por_metodo` | `ingresos.confirmados` por método: efectivo, tarjeta (app), sin identificar | vista canónica | dinero |
| `ingresos.por_tipo` | por tipo: ticket, pensión, renovación | vista canónica | dinero |
| `tickets.entradas` | Tickets con `hora_inicio` en el periodo | `operational_tickets` | conteo |
| `tickets.salidas` | Tickets con `hora_salida` en el periodo | `operational_tickets` | conteo |
| `tickets.ticket_promedio` | Promedio de `monto` de tickets pagados con salida en el periodo | `operational_tickets` | dinero |
| `tickets.estancia` | Mediana y promedio de minutos entre entrada y salida, de salidas en el periodo; distribución en rangos (<1 h, 1–3 h, 3–8 h, 8 h+) | `operational_tickets` | minutos |
| `tickets.horas_pico` | Entradas y salidas por hora local | `operational_tickets` | conteo |
| `pensiones.vigentes` | Pases con usuario, activos y `valid_from ≤ ahora < valid_to` (estado actual, no del periodo) | `pension_passes` | conteo |
| `pensiones.por_vencer` | Vigentes que vencen en los próximos 7 días | `pension_passes` | conteo |
| `pensiones.movimientos` | Entradas y salidas de pensionados en el periodo | `operational_pension_moves` | conteo |
| `externos.cobros` | Órdenes externas `confirmed` y `refunded` por proveedor | `external_payment_orders` | dinero |
| `operacion.autos_dentro` | Tickets sin salida + pensionados dentro (estado actual) (#54) | espejos | conteo |
| `operacion.ocupacion` | `autos_dentro / capacidad`; `no_disponible` sin capacidad (#54) | espejos + `proyectos` | % |
| `operacion.conectividad` | Último contacto de la instalación y estado (en línea ≤ 15 s, intermitente ≤ 60 s, desconectada) | `local_installations`, heartbeats | estado |

Las métricas de **estado actual** (`pensiones.vigentes`, `operacion.*`) no dependen del rango y se muestran como "ahora", nunca como si fueran del periodo.

### 4.1 Fuente canónica de pagos

Un mismo cobro puede existir dos veces: el pago de la app se registra en `payments` (nube, Stripe) y OPERATIVO lo aplica y lo devuelve en su espejo `operational_payments` con `provider_reference = pi_…`.

- **Llave de identidad:** `stripe_payment_intent_id` / `provider_reference` cuando existe; si no, `(installation_id, aggregate_id)` del espejo (efectivo) o el `id` del pago en la nube.
- **Gana la nube** para cobros de Stripe: refleja reembolsos y su estado es el de Stripe.
- **Efectivo** (`pos_session_*`) solo existe en el espejo.
- **Órdenes externas** son cobros por cuenta de un tercero: no suman a `ingresos.*` de la sede; van en `externos.cobros`.

### 4.2 Cobertura de datos

Cada respuesta incluye, por sede, **el último dato recibido** (máximo `received_at` del inbox de su instalación) y el **rezago** (ahora − último dato). Así una sede sin movimientos se distingue de una que no ha sincronizado: si el rezago supera 15 minutos, la respuesta marca la sede como `desactualizada`.

## 5. API (#50)

```
GET /api/estadisticas?metricas=ingresos.confirmados,tickets.entradas
    &proyectos=<ids>&desde=2026-10-01&hasta=2026-10-16
    &agrupar=dia|hora|proyecto|metodo&comparar=true
```

- `desde`/`hasta` son fechas locales (se interpretan en la zona de cada sede) o instantes ISO.
- El alcance de proyectos se aplica en el servidor: un usuario solo ve sus sedes, también en consolidados y exportaciones.
- Límites explícitos: hasta 31 días con `agrupar=hora`, 400 días con `dia`; métricas y agrupaciones solo del catálogo. Nunca se acepta SQL.
- La respuesta incluye la definición resumida de cada métrica, su estado (§3), la cobertura (§4.2), `generadoEn` y si el resultado es parcial.

La exportación CSV (#51) usa las mismas métricas y filtros y se envía por streaming.

## 6. Cómo agregar una métrica

1. Definirla en `domain/statistics/catalog` (id, descripción, fuente, unidad, dimensiones permitidas, si es de periodo o de estado actual).
2. Escribir su consulta en `infrastructure/statistics/metrics/<id>.sql.ts` usando los helpers comunes de periodo, zona y alcance.
3. Pruebas: unitaria de la definición, de integración con PostgreSQL real que concilie el resultado con una consulta de control independiente.
4. Registrarla en el catálogo. Nada más cambia.

## 7. Objetivos de carga

Para el hardware de referencia que se documente en #52, con 120 sedes, 18 meses de historia y 10 consultas simultáneas:

| Consulta | p95 | p99 |
|---|---|---|
| Dashboard de 1 sede, 30 días | ≤ 300 ms | ≤ 800 ms |
| Consolidado de todas las sedes, 30 días | ≤ 1.5 s | ≤ 3 s |
| Consolidado por día, 12 meses | ≤ 3 s | ≤ 6 s |

Además: la memoria de Node no crece con el tamaño del histórico, cada consulta tiene `statement_timeout` y las consultas de estadísticas no bloquean la ingestión del inbox (sin transacciones largas). Si #52 muestra que no se cumplen, se decide ahí entre índices adicionales, agregados por hora/día o particionamiento, con números.

## 8. Fuera de alcance

- Editar operación desde la nube: las estadísticas solo leen.
- Reportes concretos para negocio: se agregarán como métricas cuando se pidan.
- Ocupación sin capacidad capturada (#54).
