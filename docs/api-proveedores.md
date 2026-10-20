# API de proveedores Viggo — v1

**Estado:** borrador para revisión con proveedores · **Versión:** 1.0.0-borrador

Este documento define lo que un **proveedor de estacionamiento** (el sistema que administra los tickets y las plumas de un estacionamiento) debe implementar para que sus clientes paguen desde la app de Viggo.

Un proveedor que lo implementa se da de alta en Viggo solo con configuración (URL y credencial); no hace falta programar nada por proveedor.

## 1. Cómo funciona

```
 App Viggo                 Viggo (ADMINISTRATIVO)                Proveedor
    │  escanea el QR del ticket   │                                   │
    ├────────────────────────────►│  POST /v1/quotes                  │
    │                             ├──────────────────────────────────►│
    │                             │◄──────────────────────────────────┤ ticket, monto, vigencia
    │◄────────────────────────────┤ muestra monto                     │
    │  paga con tarjeta (Stripe)  │                                   │
    ├────────────────────────────►│  POST /v1/confirmations           │
    │                             ├──────────────────────────────────►│ marca el ticket como pagado
    │                             │◄──────────────────────────────────┤ referencia de confirmación
```

1. El usuario está dentro de un estacionamiento del proveedor (la app lo detecta por ubicación) y escanea el QR de su ticket.
2. **Cotizar:** Viggo le manda el QR al proveedor y el proveedor responde cuánto se debe y hasta cuándo vale ese monto.
3. El usuario paga en la app. **El monto siempre es el que respondió el proveedor**; la app nunca lo decide.
4. **Confirmar:** cuando el cobro se completa, Viggo le avisa al proveedor para que dé el ticket por pagado (y permita la salida). Si el proveedor no responde, Viggo reintenta con la misma llave de idempotencia hasta que lo confirme.

Viggo cobra al usuario; la liquidación del dinero y las comisiones se acuerdan por contrato comercial y quedan fuera de esta API.

## 2. Reglas generales

| Tema | Regla |
|---|---|
| Transporte | Solo **HTTPS**. Viggo no sigue redirecciones. |
| URL base | El proveedor nos da una URL base, por ejemplo `https://api.proveedor.com/viggo`. Las rutas de este documento se agregan a esa base (`…/viggo/v1/quotes`). |
| Formato | JSON en UTF-8 (`Content-Type: application/json`), en peticiones y respuestas. |
| Fechas | ISO 8601 con zona horaria, por ejemplo `2026-10-19T18:30:00Z`. |
| Montos | Enteros en **centavos** (`12550` = $125.50). Moneda **`MXN`**. |
| Compatibilidad | Dentro de `v1` solo se agregan campos opcionales. **Ignora los campos que no conozcas**; Viggo hace lo mismo. Un cambio incompatible sería `v2`. |
| QR | Viggo lo trata como texto opaco: lo reenvía tal cual y no lo guarda en registros. |

### 2.1 Autenticación

El proveedor le entrega a Viggo una **credencial** (un token largo y aleatorio). Viggo la guarda cifrada y la envía en cada petición:

```http
Authorization: Bearer <credencial que el proveedor le dio a Viggo>
X-Viggo-Request-Id: 0199f3a2-7c1e-7b55-9d1a-3f2b8c4e5a61
```

- `X-Viggo-Request-Id` identifica cada petición para rastrearla en los registros de ambos lados.
- Si tu API ya usa otro encabezado para su llave (por ejemplo `X-API-Key: <credencial>`), Viggo puede enviarla ahí en lugar de `Authorization: Bearer`; avísanos cuál al darte de alta.
- Una credencial inválida responde `401`. Para rotarla, el proveedor emite una nueva y se actualiza en Viggo; conviene aceptar ambas durante el cambio.

### 2.2 Errores

Todas las respuestas de error usan este cuerpo:

```json
{ "error": { "code": "TICKET_NOT_FOUND", "message": "Texto legible para soporte" } }
```

| HTTP | `code` | Cuándo | ¿Viggo reintenta? |
|---|---|---|---|
| 400 | `INVALID_REQUEST` | Faltan campos o tienen formato inválido. | No |
| 401 | `UNAUTHORIZED` | Credencial ausente o inválida. | No (alerta a soporte) |
| 404 | `TICKET_NOT_FOUND` | El QR no corresponde a un ticket de ese estacionamiento. | No |
| 409 | `TICKET_ALREADY_PAID` | El ticket ya se pagó por otro medio. | No (el cobro pasa a revisión o reembolso) |
| 409 | `AMOUNT_MISMATCH` | El monto confirmado no es el que se cotizó para esa referencia. | No (revisión) |
| 409 | `IDEMPOTENCY_CONFLICT` | Se repitió una llave de idempotencia con datos distintos. | No (revisión) |
| 410 | `TICKET_EXPIRED` | El ticket o la cotización ya no son válidos. | No |
| 429 | `RATE_LIMITED` | Demasiadas peticiones. Puedes incluir `Retry-After`. | Sí |
| 5xx | `PROVIDER_ERROR` | Error temporal del proveedor. | Sí |

Que no haya respuesta, o que llegue después del tiempo de espera, cuenta como error temporal (se reintenta).

### 2.3 Tiempos y reintentos

| Llamada | Viggo espera | Reintentos |
|---|---|---|
| Cotizar | 8 s | Hasta 3 intentos en total, a 0.1 s y 0.2 s, solo ante errores temporales. Después, la app le muestra al usuario "proveedor no disponible". |
| Confirmar | 8 s | Hasta 8 intentos con espera creciente (5 s, 10 s, 20 s… hasta 1 h). Si no se confirma, el cobro pasa a **revisión** en Viggo y se resuelve con soporte (confirmación manual o reembolso). |

## 3. `POST /v1/quotes` — Cotizar un ticket

Viggo pregunta cuánto se debe por el ticket del QR en ese estacionamiento. **No debe tener efectos** en el ticket: se puede llamar muchas veces.

### Petición

```http
POST /v1/quotes
Authorization: Bearer <credencial>
Content-Type: application/json
```

```json
{
  "qr": "contenido exacto del QR escaneado",
  "parkingId": "ID del estacionamiento en el sistema del proveedor"
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `qr` | string (1–4096) | Lo que leyó la cámara, sin modificar. |
| `parkingId` | string | El identificador que el **proveedor** le da a ese estacionamiento. Se captura en Viggo al dar de alta el estacionamiento. Si el QR es de otro estacionamiento, responde `404 TICKET_NOT_FOUND`. |

### Respuesta `200`

```json
{
  "reference": "TCK-2026-000123",
  "ticket": "000123",
  "parking": { "id": "plaza-centro", "name": "Plaza Centro" },
  "amountMinor": 12550,
  "currency": "MXN",
  "expiresAt": "2026-10-19T18:30:00Z",
  "status": "payable"
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `reference` | string (1–256) | Identifica **de forma estable** el ticket o la cotización en tu sistema. Es la que Viggo envía al confirmar. Puede ser la misma en cotizaciones sucesivas del mismo ticket o una nueva cada vez; Viggo funciona con ambas. |
| `ticket` | string (1–256) | Folio legible que se le muestra al usuario. |
| `parking.id`, `parking.name` | string (1–256) | Estacionamiento al que pertenece el ticket. |
| `amountMinor` | entero | Monto a pagar en centavos. Entre `1000` ($10.00, el mínimo que permite la pasarela) y `99999999`. |
| `currency` | string | `MXN`. |
| `expiresAt` | fecha | Hasta cuándo vale **este monto**. Recomendado: entre 5 y 15 minutos. Pasado ese momento Viggo vuelve a cotizar. |
| `status` | string | `payable` (se puede pagar), `paid` (ya pagado) o `expired` (ya no es válido). Solo `payable` permite cobrar. |

Si el ticket ya se pagó o expiró, puedes responder `200` con `status` `paid` o `expired`, o bien los errores `409 TICKET_ALREADY_PAID` / `410 TICKET_EXPIRED`. Viggo trata ambos casos igual.

## 4. `POST /v1/confirmations` — Confirmar un pago

Viggo avisa que cobró el monto cotizado. El proveedor debe dar el ticket por pagado (por ejemplo, permitir la salida) y responder una referencia de confirmación.

### Petición

```http
POST /v1/confirmations
Authorization: Bearer <credencial>
Idempotency-Key: external-confirm:0199f3a2-7c1e-7b55-9d1a-3f2b8c4e5a61
Content-Type: application/json
```

```json
{
  "reference": "TCK-2026-000123",
  "paymentReference": "pi_3UREQLEUJQtwe1bv17gxs008",
  "amountMinor": 12550,
  "currency": "MXN"
}
```

| Campo | Descripción |
|---|---|
| `Idempotency-Key` (encabezado) | Una por pago. Viggo la repite **idéntica** en cada reintento de ese pago. |
| `reference` | La `reference` que respondiste al cotizar. |
| `paymentReference` | Identificador del cobro en Viggo (para conciliación). |
| `amountMinor`, `currency` | Lo que se cobró: debe ser lo que cotizaste para esa referencia. |

### Respuesta `200`

```json
{ "confirmationReference": "CONF-88123" }
```

`confirmationReference` (string, 1–256) es tu comprobante de que aplicaste el pago; Viggo lo guarda para conciliación.

### Idempotencia (obligatoria)

Una confirmación puede llegar **más de una vez**: si tu respuesta se pierde, Viggo reintenta con la misma llave. Por eso:

1. **Misma llave y mismos datos:** responde `200` con la **misma** `confirmationReference`, sin aplicar el pago otra vez.
2. **Misma llave y datos distintos:** responde `409 IDEMPOTENCY_CONFLICT`.
3. Conserva las llaves al menos **7 días**.

### Validaciones

- `amountMinor` y `currency` deben coincidir con lo cotizado para `reference`; si no, `409 AMOUNT_MISMATCH`.
- Acepta la confirmación aunque ya haya pasado el `expiresAt` de la cotización, **hasta 24 h después**, siempre que el ticket no se haya pagado por otro medio. El usuario pagó dentro de la vigencia; la confirmación puede retrasarse por reintentos.
- Si el ticket ya se había pagado por otro medio, responde `409 TICKET_ALREADY_PAID`. Viggo manda ese cobro a revisión para reembolsarlo.

## 4.1 `GET /v1/confirmations/{idempotencyKey}` — Estado de una confirmación (recomendado)

Si la respuesta de una confirmación se pierde (tiempo de espera, `5xx`), Viggo pregunta si la aplicaste antes de reintentar o de mandar el cobro a revisión. Con esto un pago que sí aplicaste no termina reembolsado por error.

```http
GET /v1/confirmations/external-confirm%3A0199f3a2-7c1e-7b55-9d1a-3f2b8c4e5a61
Authorization: Bearer <credencial>
```

- **`200`** con la misma respuesta que diste al confirmar: `{ "confirmationReference": "CONF-88123" }`.
- **`404 CONFIRMATION_NOT_FOUND`** si no aplicaste ninguna confirmación con esa llave.

La llave va codificada en la ruta (`:` es `%3A`). Es opcional: sin ella Viggo solo reintenta con la misma llave, y una confirmación que no logre entregar queda en revisión manual.

## 5. Ejemplo completo

```bash
# Cotizar
curl -s https://api.proveedor.com/viggo/v1/quotes \
  -H "Authorization: Bearer $CREDENCIAL" -H "Content-Type: application/json" \
  -d '{"qr":"PRV|000123|plaza-centro","parkingId":"plaza-centro"}'

# Confirmar (repetir esta llamada debe dar la misma respuesta)
curl -s https://api.proveedor.com/viggo/v1/confirmations \
  -H "Authorization: Bearer $CREDENCIAL" -H "Content-Type: application/json" \
  -H "Idempotency-Key: external-confirm:prueba-1" \
  -d '{"reference":"TCK-2026-000123","paymentReference":"pi_prueba","amountMinor":12550,"currency":"MXN"}'

# ¿Se aplicó esa confirmación?
curl -s https://api.proveedor.com/viggo/v1/confirmations/external-confirm%3Aprueba-1 \
  -H "Authorization: Bearer $CREDENCIAL"
```

## 6. Servidor de referencia

`scripts/provider-reference-server.ts` es un proveedor de ejemplo que cumple este documento, con tickets de prueba en memoria. Sirve para que el proveedor compare su implementación respuesta por respuesta y para las pruebas de Viggo.

```bash
npm run provider:reference          # http://127.0.0.1:4010, credencial "referencia-viggo"
```

| QR de prueba | `parkingId` | Resultado al cotizar |
|---|---|---|
| `PRV\|000123\|plaza-centro` | `plaza-centro` | `payable`, $125.50 |
| `PRV\|000124\|plaza-centro` | `plaza-centro` | `paid` |
| `PRV\|000125\|plaza-centro` | `plaza-centro` | `410 TICKET_EXPIRED` |
| `PRV\|000123\|plaza-centro` | `otro` | `404 TICKET_NOT_FOUND` |

## 7. Checklist del proveedor

- [ ] HTTPS con certificado válido y credencial para Viggo.
- [ ] `POST /v1/quotes` sin efectos, con monto en centavos y vigencia.
- [ ] `POST /v1/confirmations` idempotente por `Idempotency-Key` (7 días).
- [ ] (Recomendado) `GET /v1/confirmations/{idempotencyKey}`: `200` con la confirmación aplicada o `404`.
- [ ] Validación de monto contra lo cotizado y tolerancia de 24 h tras la vigencia.
- [ ] Errores con el formato y los códigos de la sección 2.2.
- [ ] Respuestas en menos de 8 s.
- [ ] Ambiente de pruebas (sandbox) con QR de ejemplo para validar antes de producción.
