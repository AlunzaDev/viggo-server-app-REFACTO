# Failure recovery phase 2.1 and 2.2

## 2.1 Queue states and retries

Mobile operations between ADMINISTRATIVO and OPERATIVO now use explicit retry state.

States:

- `pending`: ready to be claimed by the local operative server.
- `processing`: claimed and currently being executed.
- `completed`: applied successfully.
- `failed`: failed but still retryable when `nextRetryAt` is reached.
- `expired`: no longer valid because its `expiresAt` passed.
- `dead_letter`: automatic retries were exhausted.

Retry fields:

- `attempts`
- `maxAttempts`
- `lastAttemptAt`
- `nextRetryAt`
- `processingDeadlineAt`

Default policy:

- `CREATE_TICKET`, `QUOTE_TICKET`, `EXIT_TICKET`: `maxAttempts = 3`.
- `APPLY_TICKET_PAYMENT`: `maxAttempts = 12`.
- `PENSION_PASS_ACCESS` (`POST /api/mobile/pension-pass/:id/access`): `maxAttempts = 1` and a 15s expiration. It opens a barrier: a late or repeated opening is worse than a failed one, and OPERATIVO's rejection (anti-passback, schedule) is final. OPERATIVO stores the command receipt in the same transaction as the passage, so a re-delivery returns the recorded move instead of failing anti-passback.
- Retry backoff: immediate, 30s, 2min, 5min, 15min.
- Short-lived commands can expire.
- Payment application commands are created without short expiration.

## 2.2 Restart recovery

When ADMINISTRATIVO starts, one instance (job lease `mobile-operations-recovery`):

- releases stale `processing` operations back to `pending`;
- sets `nextRetryAt` so the operative server can claim them again.

When OPERATIVO receives a retried command, it remains idempotent:

- `MobileCommandReceipt.operationId` prevents re-executing completed commands.
- `Payment.providerReference` prevents applying the same cloud payment twice.
- Ticket creation still checks for the active ticket before creating another one.

This allows a payment command to recover if OPERATIVO applied the local payment but restarted before reporting `completed` to ADMINISTRATIVO.

## 2.3 Dead-letter operation

ADMINISTRATIVO exposes protected admin endpoints for stuck mobile operations:

- `GET /api/mobile-operations?status=dead_letter`
- `GET /api/mobile-operations?status=failed`
- `GET /api/mobile-operations?proyectoId=<id>&type=APPLY_TICKET_PAYMENT`
- `POST /api/mobile-operations/:operationId/reactivate`

Reactivation moves an operation from `dead_letter`, `failed` or `expired` back to `pending`, clears the last error, and makes it immediately claimable by OPERATIVO.

## 2.4 Healthchecks

ADMINISTRATIVO:

- `GET /api/health`
- `GET /api/health/db`
- `GET /api/health/sync`
- `GET /api/health/financial-worker`

OPERATIVO:

- `GET /api/health`
- `GET /api/health/db`
- `GET /api/health/local-project`
- `GET /api/health/devices`

Health responses use `ok`, `degraded` or `down` and avoid exposing secrets.

## 2.5 Disconnection detection

ADMINISTRATIVO derives installation connectivity from `lastCommandPollAt`:

- `online`: last poll within 15 seconds.
- `degraded`: last poll between 15 and 60 seconds.
- `offline`: no poll for more than 60 seconds.

Endpoints:

- `GET /api/health/sync`
- `GET /api/installations/:installationId/connectivity`

OPERATIVO derives device health from `deviceRuntime.lastHeartbeatAt`:

- `GET /api/health/devices`

Mobile operations that require immediate local response can still be rejected when the installation is offline.

## 2.6 Operational incidents

ADMINISTRATIVO now stores operational incidents in `OperationalIncident`.

Incident types:

- `INSTALLATION_OFFLINE`
- `MOBILE_OPERATION_DEAD_LETTER`
- `FINANCIAL_WORKER_FAILED`

Endpoints:

- `GET /api/operational-incidents?status=open`
- `GET /api/operational-incidents?type=INSTALLATION_OFFLINE`
- `GET /api/operational-incidents?projectId=<id>`
- `POST /api/operational-incidents/:incidentKey/resolve`

Automatic behavior:

- Health sync opens `INSTALLATION_OFFLINE` when an approved installation stops polling.
- Sync polling resolves `INSTALLATION_OFFLINE` when the installation comes back.
- Dead-letter mobile operations open `MOBILE_OPERATION_DEAD_LETTER`.
- Reactivating a dead-letter operation resolves its incident.
- Financial worker failures open `FINANCIAL_WORKER_FAILED`; a successful run resolves it.

Incidents are centralized in ADMINISTRATIVO. OPERATIVO reports health/device state, while ADMINISTRATIVO records incidents for support and operations.
