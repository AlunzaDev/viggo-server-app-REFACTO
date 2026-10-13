# Laboratorio local de tickets

Disponible únicamente cuando `PROD=false`:

```text
http://localhost:3000/api/dev/ticket-lab/
```

En un teléfono conectado a la misma red:

```text
http://192.168.200.34:3000/api/dev/ticket-lab/
```

## API JSON

### Crear un escenario

`POST /api/dev/ticket-lab/tickets`

```json
{
  "userId": "OBJECT_ID_USUARIO",
  "moduleId": "OBJECT_ID_MODULO_ENTRADA",
  "minutesAgo": 59.6,
  "pagado": false,
  "replaceActive": true
}
```

También se puede enviar `horaInicio` como timestamp en milisegundos. La duración,
el redondeo y el monto usan las reglas vigentes del backend operativo.

### Generar solamente el QR

`POST /api/dev/ticket-lab/module-token`

```json
{
  "moduleId": "OBJECT_ID_MODULO"
}
```

El token del módulo dura 24 horas. El endpoint y la página no se montan cuando
el backend está ejecutándose con `PROD=true`.
