# Viggo Server API — NUBEADMIN

API administrativa en nube separada del servicio operativo local de Viggo.

## Responsabilidades

- autenticación global, recuperación y validación de cuentas;
- usuarios, roles y perfiles de permisos;
- proyectos/parkings;
- catálogo administrativo de módulos;
- planes de pensión y contratos Pension Pass;
- Stripe e historial central de pagos;
- proveedores;
- configuración y recepción idempotente de eventos desde LOCALOPE.

## Fuera de este servicio

No contiene ni ejecuta tickets operativos, caja, efectivo, barreras, heartbeat de dispositivos, Socket.IO, movimientos físicos de acceso ni runtime del estacionamiento. Esas responsabilidades pertenecen a `viggo-server-api-LOCALOPE`.

## Inicio local

```bash
cp .env.example .env.dev
npm install
npm run dev
```

La API usa `APP_ENV=dev` de forma predeterminada y carga `.env.dev` cuando existe.

## Validación y producción

```bash
npm run check
npm run build
npm start
```

También puede ejecutarse con:

```bash
docker compose up --build
```

## Rutas principales

- `GET /api/ping`
- `GET /api/health`
- `/api/auth`
- `/api/usuarios`
- `/api/permission-profiles`
- `/api/proyectos`
- `/api/modulos`
- `/api/pensiones`
- `/api/pension-pass`
- `/api/payments`
- `/api/stripe`
- `/api/proveedores`
- `/api/sync`

## Sincronización LOCALOPE → NUBEADMIN

Las rutas `/api/sync` requieren:

```http
Authorization: Bearer <SYNC_SERVICE_TOKEN>
X-Viggo-Installation-Id: <installation-id>
```

### Descargar configuración administrativa

```http
GET /api/sync/configuration/:proyectoId
```

Devuelve el proyecto, módulos, planes de pensión y contratos necesarios para generar una proyección local.

### Enviar evento idempotente

```http
POST /api/sync/events
Content-Type: application/json
```

```json
{
  "eventId": "uuid-estable",
  "proyectoId": "mongo-project-id",
  "eventType": "ticket.paid",
  "aggregateId": "ticket-id-local",
  "occurredAt": 1784820000000,
  "payload": {}
}
```

`eventId` es único. Un reintento devuelve éxito con `duplicate: true` y no duplica el evento.

## Decisiones de compatibilidad

Los nombres `Proyecto`, `Pension` y `PensionPass` se conservaron para reducir el riesgo de migración. El módulo administrativo ya no persiste información de binding o runtime de dispositivos. El estado físico `inParking` permanece temporalmente en el esquema de Pension Pass por compatibilidad, pero NUBEADMIN no lo modifica mediante sus endpoints administrativos.

## Pendientes recomendados

1. crear un registro formal de instalaciones LOCALOPE con credenciales rotables;
2. procesar la bandeja `SyncInboxEvent` mediante handlers por `eventType`;
3. agregar webhook de Stripe y una máquina de estados de pagos;
4. sustituir la reserva de precontratos por `reservedUntil` y un job persistente;
5. versionar contratos de sincronización mediante DTOs compartidos.

## Desarrollo en Node.js 22

`npm run dev` realiza una compilación inicial, mantiene TypeScript en modo `--watch` y ejecuta `dist/app.js` con el watcher nativo de Node. Esto evita depender de `--experimental-strip-types`, que en Node.js 22.12 no resuelve imports de directorios ni transforma todas las construcciones de TypeScript utilizadas por el proyecto.

# Arquitectura NUBEADMIN

## Fuente

Este proyecto se derivó de `viggo-server-app-REFACTO`, conservando las verticales administrativas y separando la operación física hacia `viggo-server-api-LOCALOPE`.

## Incluido

- Auth global, correo, recuperación y validación.
- Usuarios, roles, parkings permitidos, módulos funcionales y perfiles de permisos.
- CRUD de proyectos/parkings.
- CRUD del catálogo de módulos, sin binding ni runtime de dispositivos.
- CRUD de planes de pensión.
- Inventario, precontrato, contratación y renovación de Pension Pass.
- Stripe genérico e historial de pagos.
- Proveedores.
- Endpoint de configuración para LOCALOPE.
- Inbox idempotente para eventos producidos por LOCALOPE.

## Excluido

- Tickets de entrada/salida.
- Caja, turnos, cortes, conteos y movimientos.
- Inserción y cobro en efectivo.
- Socket.IO y sesiones de dispositivos.
- Fingerprint, binding, heartbeat y auditoría de conexión.
- Apertura de barreras.
- Movimiento operativo de pensionados.
- Mutación del estado local `inParking`.

## Flujo esperado

```text
Dashboard/App ───────────────► NUBEADMIN
                                  │
                                  │ configuración / contratos
                                  ▼
                              LOCALOPE
                                  │
                                  │ eventos operativos idempotentes
                                  └────────────────────────────► NUBEADMIN Inbox
```

NUBEADMIN es autoridad de identidad y configuración. LOCALOPE es autoridad inmediata de la operación física.
