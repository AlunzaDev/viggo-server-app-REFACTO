# Viggo Server API — ADMINISTRATIVO

API administrativa en nube separada del servicio operativo local de Viggo.

## Responsabilidades

- autenticación global, recuperación y validación de cuentas;
- usuarios, roles y perfiles de permisos;
- proyectos/parkings;
- catálogo administrativo de módulos;
- planes de pensión y contratos Pension Pass;
- Stripe e historial central de pagos;
- proveedores;
- configuración y recepción idempotente de eventos desde OPERATIVO.

## Fuera de este servicio

No contiene ni ejecuta tickets operativos, caja, efectivo, barreras, heartbeat de dispositivos, Socket.IO, movimientos físicos de acceso ni runtime del estacionamiento. Esas responsabilidades pertenecen a `viggo-server-api-OPERATIVO`.

## Inicio local

```bash
cp .env.example .env.dev
npm install
docker compose up -d postgres   # PostgreSQL en 127.0.0.1:5434
npm run db:migrate              # aplica las migraciones de Prisma
npm run dev
```

La API usa `APP_ENV=dev` de forma predeterminada y carga `.env.dev` cuando existe. La base de datos es PostgreSQL (`DATABASE_URL`).

Para datos de demostración: `npm run db:seed`. Crea un super admin (`admin@viggo.local`), un perfil de permisos por app, dos estacionamientos con módulos, una pensión mensual con pases libres, un cajero y un cliente. Las contraseñas se toman de `SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD` o se generan y se muestran una sola vez. Es idempotente y no corre con `APP_ENV=prod`.

## Base de datos (PostgreSQL + Prisma)

- Esquema: `prisma/schema.prisma`. Configuración (URL, migraciones, seed): `prisma.config.ts`, que carga el mismo `.env.<APP_ENV>` que la API.
- El cliente se genera en `src/generated/prisma` (no se versiona); `npm run build`, `npm run check` y `npm run dev` lo generan.
- La conexión vive en `src/data/postgres/postgres.database.ts` (`PostgresDatabase`). `DATABASE_POOL_MAX` limita las conexiones por instancia: mantener `instancias × DATABASE_POOL_MAX` por debajo de `max_connections` de Postgres.
- `pg` va fijado en 8.x (versión exacta en `package.json`). Dentro de una transacción, Prisma 7 lanza en paralelo las consultas de un `include` con varias relaciones sobre la misma conexión; `pg@8` las encola con un aviso y `pg@9` las rechazará. Por eso, dentro de una transacción (o en una escritura anidada) no se usa `include` con varias relaciones: se escribe primero y se lee después, o se cargan las relaciones una por una. Los tests fallan si aparece el aviso. `relationLoadStrategy: "join"` lo resolvería, pero en Prisma 7.10 sigue siendo preview (`relationJoins`); revisar al subir a Prisma 8 antes de pasar a `pg@9`.

| Script | Uso |
|---|---|
| `npm run db:migrate` | Crea/aplica migraciones en desarrollo (`prisma migrate dev`) |
| `npm run db:migrate:deploy` | Aplica migraciones pendientes sin crear nuevas (producción/CI) |
| `npm run db:seed` | Carga datos de prueba (nunca con `APP_ENV=prod`) |
| `npm run db:studio` | Abre Prisma Studio |
| `npm run db:generate` | Regenera el cliente de Prisma |

## Tests

```bash
cp .env.test.example .env.test
docker compose up -d postgres   # crea también la base viggo_administrativo_test
npm test
```

Los tests usan `.env.test` y se niegan a correr si la base no termina en `_test`. Antes de correr se aplican las migraciones pendientes (`prisma migrate deploy`); cada test limpia los datos que crea. Unitarios en `tests/unit`, integración contra Postgres en `tests/integration`.

## Validación y producción

```bash
npm run check   # genera el cliente de Prisma y revisa tipos de src y tests
npm test
npm run build
npm start
```

También puede ejecutarse con:

```bash
docker compose up --build
```

Docker levanta PostgreSQL, un servicio `migrate` que aplica las migraciones y termina, y la API, que sólo arranca si las migraciones salieron bien. Define un `POSTGRES_PASSWORD` seguro antes del primer arranque. La API cierra conexiones limpiamente al recibir `SIGTERM` (`docker stop`).

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

## Sincronización OPERATIVO → ADMINISTRATIVO

Cada instalación local usa su propio token de sincronización; no hay token global.

1. **Vinculación** (`POST /installation-link/preview`, `POST /installation-requests`,
   `GET /installation-request/status`): se autentican con el token de vinculación del
   proyecto (`Authorization: Bearer <installationLinkToken>`). El proyecto se deduce del
   token; la instalación nunca lo elige.
2. Cuando un administrador aprueba la solicitud, la siguiente consulta de
   `/installation-request/status` entrega `oneTimeSyncToken` (sólo se guarda su sha256 en
   `local_installations.sync_token_hash`; consultar de nuevo lo rota).
3. El resto de `/api/sync` requiere el token de la instalación aprobada:

```http
Authorization: Bearer <oneTimeSyncToken>
X-Viggo-Installation-Id: <installation-id>
```

y sólo da acceso al proyecto de esa instalación (otro `proyectoId` responde
`403 SYNC_PROJECT_MISMATCH`). Al desvincular la instalación el token deja de servir.

### Descargar configuración administrativa

```http
GET /api/sync/configuration/:proyectoId
```

Devuelve el proyecto, módulos, planes de pensión y contratos necesarios para generar una proyección local.

### Descargar snapshot de accesos

```http
GET /api/sync/access-snapshot/:proyectoId
```

Devuelve usuarios autorizados para el parking, usuarios `SUPER_ROLE` y los perfiles de permisos relacionados. Incluye el hash de password porque `OPERATIVO` debe poder autenticar localmente aunque no haya internet.

El snapshot se aplica en OPERATIVO con:

```http
PUT /api/sync/snapshots/access
```

### Enviar evento idempotente

```http
POST /api/sync/events
Content-Type: application/json
```

```json
{
  "eventId": "uuid-estable",
  "proyectoId": "uuid-del-proyecto",
  "eventType": "ticket.paid",
  "aggregateId": "ticket-id-local",
  "occurredAt": 1784820000000,
  "payload": {}
}
```

`eventId` es único. Un reintento devuelve éxito con `duplicate: true` y no duplica el evento.

## Decisiones de compatibilidad

Los nombres `Proyecto`, `Pension` y `PensionPass` se conservaron para reducir el riesgo de migración. El módulo administrativo ya no persiste información de binding o runtime de dispositivos. El estado físico `inParking` permanece temporalmente en el esquema de Pension Pass por compatibilidad, pero ADMINISTRATIVO no lo modifica mediante sus endpoints administrativos.

## Pendientes recomendados

1. crear un registro formal de instalaciones OPERATIVO con credenciales rotables;
2. versionar los snapshots operativos y supervisar errores pendientes del inbox;
3. agregar webhook de Stripe y una máquina de estados de pagos;
4. sustituir la reserva de precontratos por `reservedUntil` y un job persistente;
5. versionar contratos de sincronización mediante DTOs compartidos.

## Desarrollo en Node.js 22

`npm run dev` realiza una compilación inicial, mantiene TypeScript en modo `--watch` y ejecuta `dist/app.js` con el watcher nativo de Node. Esto evita depender de `--experimental-strip-types`, que en Node.js 22.12 no resuelve imports de directorios ni transforma todas las construcciones de TypeScript utilizadas por el proyecto.

# Arquitectura ADMINISTRATIVO

## Fuente

Este proyecto se derivó de `viggo-server-app-REFACTO`, conservando las verticales administrativas y separando la operación física hacia `viggo-server-api-OPERATIVO`.

## Incluido

- Auth global, correo, recuperación y validación.
- Usuarios, roles, parkings permitidos, módulos funcionales y perfiles de permisos.
- CRUD de proyectos/parkings.
- CRUD del catálogo de módulos, sin binding ni runtime de dispositivos.
- CRUD de planes de pensión.
- Inventario, precontrato, contratación y renovación de Pension Pass.
- Stripe genérico e historial de pagos.
- Proveedores.
- Endpoint de configuración para OPERATIVO.
- Inbox idempotente para eventos producidos por OPERATIVO.

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
Dashboard/App ───────────────► ADMINISTRATIVO
                                  │
                                  │ configuración / contratos
                                  ▼
                              OPERATIVO
                                  │
                                  │ eventos operativos idempotentes
                                  └────────────────────────────► ADMINISTRATIVO Inbox
```

ADMINISTRATIVO es autoridad de identidad y configuración. OPERATIVO es autoridad inmediata de la operación física.
# Nota: codigo corto de proyecto

Cada proyecto nuevo recibe automaticamente un `codigoProyecto` creciente de 4 digitos (`0001` a `9999`), asignado por la secuencia `proyecto_codigo_seq` de PostgreSQL. Es distinto al `identificador` existente y sirve como referencia corta, humana y estable para parkings.

# Nota: consulta directa a OPERATIVO

Modo actual para operacion visible desde nube: `ADMINISTRATIVO` usa `localApiBaseUrl` del proyecto y consulta el API local.

```http
GET /api/local-projects/:projectId/snapshot?from=<epoch>&to=<epoch>
Authorization: Bearer <JWT usuario dashboard>
```

Internamente `ADMINISTRATIVO` llama a:

```http
GET <localApiBaseUrl>/api/local-reports/snapshot
Authorization: Bearer <token de llamada de la instalacion>
X-Viggo-Sync-Source: administrativo-direct-query
```

No hay token compartido: el token de llamada es un HMAC del token de sincronizacion de esa instalacion (`viggo:administrativo->operativo`), que ADMINISTRATIVO guarda cifrado al entregar el token y OPERATIVO calcula con el suyo. No sirve para hacerse pasar por la instalacion ante la nube. Una instalacion aprobada antes de este cambio no lo tiene: se arregla rotando su token desde *Instalaciones*.

### Rotar el token de una instalacion

Desde *Instalaciones* (`POST /api/installations/:id/rotate-token`) se pide la rotacion sin desvincular. En su siguiente llamada de sync la instalacion recibe el encabezado `X-Viggo-Sync-Token-Rotation: required` y pide un token nuevo (`POST /api/sync/sync-token/rotate`). El token anterior sigue valido hasta que el nuevo se usa por primera vez, asi que una respuesta perdida solo se reintenta.

Este flujo sirve para estado en vivo cuando existe conexion hacia el servidor local. El historial de `/api/local-projects/:projectId/snapshot` se consulta en las tablas espejo de la nube; el heartbeat conserva su consulta en vivo y su fallback almacenado.

# Nota: token por instalacion

Al crear un proyecto, ADMINISTRATIVO genera un token de vinculacion y lo muestra al administrador. ADMINISTRATIVO guarda `installationLinkTokenHash` para validarlo de forma segura, `installationLinkTokenEncrypted` para poder volver a mostrarlo en admin y `installationLinkTokenIssuedAt` como referencia de emision. OPERATIVO debe ingresar ese token para poder solicitar vinculacion; si coincide con el hash del proyecto, la solicitud queda registrada.

## Inbox operativo (#12)

Los eventos `created`/`updated` de `ticket`, `payment`, `cash_payment_session`,
`cash_register_shift`, `cash_register_movement`, `cash_register_cut` y `pension_move`
se aplican a tablas `operational_*` de solo lectura. Se conserva el snapshot JSONB
original de los triggers locales, con claves por proyecto, instalaci?n y agregado;
las referencias locales permanecen en el snapshot para aceptar hijos antes que padres.
No se modifica la tabla de pagos de Stripe ni se duplican cobros.

OPERATIVO env?a `sourcePosition` como cadena decimal del BIGSERIAL del outbox.
Esta posici?n decide qu? snapshot es m?s reciente, incluso con tiempos iguales o
relojes que retroceden. Para eventos anteriores sin posici?n se usa `occurredAt`,
con `eventId` como desempate determinista. No se deben reiniciar posiciones de una
instalaci?n conservando su identidad. Eventos anteriores con el mismo milisegundo
no permiten reconstruir su orden real; los nuevos env?os s? incluyen la posici?n.

El registro espejo y `processedAt` se guardan en una misma transacci?n. Un fallo
conserva el recibo con `processingError` y `lastAttemptAt`, y no bloquea la entrega
local. Un job cada 5 segundos procesa lotes de 100, reintentando fallos despu?s de
60 segundos. Los tipos desconocidos quedan pendientes para inspecci?n. Los recibos
anteriores pendientes tambi?n se procesan al iniciar. `accepted` confirma recepci?n
durable, no necesariamente procesamiento exitoso.

Aplicar `npm run db:migrate:deploy` antes de iniciar ADMINISTRATIVO actualizado.
`npm test` usa exclusivamente una base con nombre terminado en `_test`; incluye
concurrencia, duplicados, llegada tard?a, reintentos e historial sin servidor local.
