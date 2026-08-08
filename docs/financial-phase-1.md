# Inventario financiero — Fase 1

## Operaciones protegidas

| Operación | Aplicación | Protección principal |
| --- | --- | --- |
| Crear boleto móvil | Nube → Operativo | `Idempotency-Key`, cola única y recibo local único |
| Cotizar y pagar boleto móvil | Nube → Stripe → Operativo | Precio local, clave única de Stripe, pago único y aplicación local transaccional |
| Cobrar boleto en caja | Operativo | Sesión activa única, clave de evento y actualización condicional |
| Movimiento manual de caja | Operativo | Clave única y rechazo de reutilización con otro payload |
| Precontratar pensión | Administrativo | Reserva atómica del pase, clave registrada e índice usuario+pensión |
| Contratar pensión | Administrativo | Pago Stripe verificado y transición condicional no vigente → vigente |
| Renovar pensión | Administrativo | Precio calculado en servidor, pago Stripe verificado, clave y comparación de vigencia |
| Cancelar pensión o pase | Administrativo | Baja lógica con actor, fecha y motivo; no se elimina el documento |

## Reglas

- Las claves deben tener entre 16 y 128 caracteres y sólo usan letras, números, `.`, `_`, `:` o `-`.
- Repetir la misma clave y el mismo payload devuelve el resultado existente.
- Reutilizar una clave para otro usuario, recurso o importe produce `409 Conflict`.
- El cliente no determina el precio de una pensión: el API lo obtiene del plan activo y lo multiplica por los meses permitidos.
- Una contratación o renovación requiere que el `PaymentIntent` corresponda al usuario, pase y tipo de operación, y que Stripe reporte `succeeded`.
- Los documentos financieros no se eliminan desde los servicios HTTP. La cancelación usa `PATCH /:id/cancel` y conserva el registro auditado.

## Índices de integridad

- `Payment.idempotencyKey`: único y parcial.
- `Payment.stripePaymentIntentId`: único y parcial.
- `MobileOperation.idempotencyKey`: único.
- `PensionPass.idPass`: único.
- `PensionPass.usuario + pension`: único para pases activos asignados.
- `PensionPass.financialOperations.key`: único.
- Movimientos de caja por `idempotencyKey`: único y parcial.
- Una sola sesión activa de cobro por boleto.
