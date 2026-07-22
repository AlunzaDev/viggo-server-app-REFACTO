# Integracion futura con dispositivos POS fisicos

Este backend ya acepta pagos manuales de caja y deja preparado el campo `rawEvent`
para registrar de donde vino cada ingreso de efectivo.

## Contrato base del evento

Cuando se conecte un periferico real, el agente local de la caja deberia mandar el
mismo endpoint actual:

`POST /api/cash-payments/sessions/:sessionId/insert-cash`

Payload sugerido:

```json
{
  "amount": 100,
  "rawEvent": {
    "idempotencyKey": "device-event-unique-id",
    "source": "pos_agent",
    "deviceMode": "hardware",
    "hardwareDeviceId": "bill-acceptor-cj1",
    "moduloId": "mongo-modulo-id",
    "moduloIdentificador": "CJ1",
    "inputMode": "bill_acceptor",
    "denomination": 100,
    "currency": "MXN",
    "acceptedAt": 1784746296058
  }
}
```

## Responsabilidades del agente local

- Leer el dispositivo fisico, por ejemplo aceptador de billetes, monedero o caja inteligente.
- Generar un `idempotencyKey` unico por evento real recibido del hardware.
- Reintentar el envio si no hay red, usando el mismo `idempotencyKey`.
- No decidir si el boleto queda pagado; eso lo decide el backend con el saldo pendiente.
- Reportar errores del dispositivo como eventos separados cuando se agregue ese endpoint.

## Responsabilidades del backend

- Validar que la sesion de cobro siga activa.
- Evitar duplicar el mismo evento si llega repetido con el mismo `idempotencyKey`.
- Sumar solo el efectivo aceptado y calcular cambio.
- Registrar el movimiento neto del boleto en el turno de caja.
- Mantener auditoria en turno, movimientos, conteo y corte.

De momento `viggo_web` manda `deviceMode: "manual"` y `hardwareDeviceId: null`.
Cuando exista el periferico, el cambio principal sera reemplazar ese origen por un
agente local o integracion WebUSB/WebSerial validada en campo.
