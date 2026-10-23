# Retención de datos

Qué guarda ADMINISTRATIVO (la nube), cuánto tiempo y por qué (REFACTO#69). La política de la PC de cada estacionamiento está en `docs/retencion.md` de OPERATIVO.

Principios:

- **Nada pendiente se borra**: eventos sin procesar, operaciones sin terminar, incidentes abiertos.
- **Las estadísticas siempre se pueden reconstruir** dentro del periodo de retención de sus fuentes; fuera de él quedan sus totales.
- **La depuración corre sola, por lotes y fuera de las peticiones HTTP** (job con job-lock), y registra cuánto borró.
- **Cada plazo es una variable de entorno**; `0` desactiva esa depuración.

## Plazos

| Datos | Tablas | Plazo | Se mide por | Variable |
|---|---|---|---|---|
| Pagos de la app y de terceros | `payments`, `external_payment_orders`, `external_payment_events` | 5 años | fecha de creación | `RETENTION_FINANCIAL_DAYS` (1825) |
| Fuentes de estadísticas (espejo de OPERATIVO) | `operational_tickets`, `operational_payments`, `operational_pension_moves`, `operational_cash_*` | 5 años | `occurred_at` | `RETENTION_OPERATIONAL_DAYS` (1825) |
| Totales de estadísticas | `statistics_hourly_*`, `statistics_daily_*` | Siempre | — | — |
| Eventos recibidos de OPERATIVO ya procesados | `inbox_events` | 30 días | `processed_at` | `RETENTION_INBOX_DAYS` (30) |
| Operaciones de la app ya terminadas | `mobile_operations` (`completed`, `expired`) | 90 días | `updated_at` | `RETENTION_MOBILE_OPERATIONS_DAYS` (90) |
| Incidentes resueltos | `operational_incidents` (`resolved`) | 1 año | `resolved_at` | `RETENTION_INCIDENTS_DAYS` (365) |
| Historial de conexión | `connection_events` | 1 año | `occurred_at` | `RETENTION_CONNECTION_EVENTS_DAYS` (365) |
| Navegadores con avisos sin entregas | `push_subscriptions` | 6 meses sin entregas | `last_success_at` (o `created_at` si nunca recibió uno) | `RETENTION_PUSH_SUBSCRIPTIONS_DAYS` (180) |

Lo demás no crece con el uso (catálogos, usuarios, proyectos, configuración) o se sobrescribe (`project_heartbeat_snapshots`, `modulo_device_states`) y no se depura.

## Lo que nunca se borra

- `inbox_events` sin procesar o con error.
- `mobile_operations` pendientes, en proceso o en `dead_letter` (se quedan hasta resolverse).
- `operational_incidents` abiertos.
- Pagos con conciliación o reembolso pendiente: el plazo financiero se mide desde que se crearon y supera cualquier conciliación.

## Notas

- **5 años** para lo contable sigue el plazo del Código Fiscal de la Federación (art. 30); confirmarlo con contabilidad antes de producción.
- Al vencer las fuentes de un periodo, sus totales (`statistics_*`) siguen; ese periodo ya no se puede recomputar desde las fuentes.
- El resumen de caídas (`/api/heartbeat/historial/resumen`) recorre el historial de cada módulo: con un año de retención su costo queda acotado.
