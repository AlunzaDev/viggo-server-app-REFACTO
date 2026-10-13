-- Short human code for projects ("0001".."9999"), used by proyectos.codigo_proyecto.
CREATE SEQUENCE "proyecto_codigo_seq" AS integer MINVALUE 1 MAXVALUE 9999 NO CYCLE;

-- CreateEnum
CREATE TYPE "user_app" AS ENUM ('ADMIN_WEB', 'OPERATIVE_WEB', 'OPERATIVE_MOBILE');

-- CreateEnum
CREATE TYPE "user_module" AS ENUM ('cashPayments', 'users', 'permissionProfiles', 'installations', 'projects', 'modules', 'pensions', 'pensionPasses', 'tickets', 'pensionMoves', 'payments');

-- CreateEnum
CREATE TYPE "modulo_tipo" AS ENUM ('ENTRADA', 'SALIDA', 'POS');

-- CreateEnum
CREATE TYPE "submodulo_tipo" AS ENUM ('QR_SCANNER', 'PRINTER', 'BARRIER', 'CAMERA', 'CASH_DRAWER', 'CASH_ACCEPTOR', 'DISPLAY', 'KEYPAD', 'OTHER');

-- CreateEnum
CREATE TYPE "remote_support_provider" AS ENUM ('MESHCENTRAL', 'RUSTDESK', 'VIGGO_REMOTE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "device_connection_status" AS ENUM ('CONNECTED', 'DISCONNECTED', 'PENDING', 'REJECTED', 'MISMATCH');

-- CreateEnum
CREATE TYPE "device_heartbeat_status" AS ENUM ('online', 'offline', 'pending');

-- CreateEnum
CREATE TYPE "pension_pass_operation_type" AS ENUM ('precontract', 'contract', 'renew');

-- CreateEnum
CREATE TYPE "payment_type" AS ENUM ('ticket', 'pension', 'renewal');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('succeeded', 'pending', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "reconciliation_status" AS ENUM ('pending', 'reconciled', 'failed');

-- CreateEnum
CREATE TYPE "mobile_operation_type" AS ENUM ('CREATE_TICKET', 'QUOTE_TICKET', 'APPLY_TICKET_PAYMENT', 'EXIT_TICKET');

-- CreateEnum
CREATE TYPE "mobile_operation_status" AS ENUM ('pending', 'processing', 'completed', 'failed', 'expired', 'dead_letter');

-- CreateEnum
CREATE TYPE "installation_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "incident_type" AS ENUM ('INSTALLATION_OFFLINE', 'MOBILE_OPERATION_DEAD_LETTER', 'FINANCIAL_WORKER_FAILED');

-- CreateEnum
CREATE TYPE "incident_status" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "incident_severity" AS ENUM ('info', 'warning', 'critical');

-- CreateTable
CREATE TABLE "roles" (
    "code" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "email_validated" BOOLEAN NOT NULL DEFAULT false,
    "email_validation_token_hash" TEXT,
    "email_validation_expires_at" TIMESTAMPTZ(3),
    "telefono" TEXT NOT NULL,
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "password" TEXT NOT NULL,
    "password_reset_token_hash" TEXT,
    "password_reset_expires_at" TIMESTAMPTZ(3),
    "rol" TEXT NOT NULL DEFAULT 'CLIENT_ROLE',
    "allowed_apps" "user_app"[] DEFAULT ARRAY[]::"user_app"[],
    "nacimiento" DATE,
    "img" TEXT NOT NULL DEFAULT '',
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "google" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_parkings" (
    "usuario_id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,

    CONSTRAINT "usuario_parkings_pkey" PRIMARY KEY ("usuario_id","proyecto_id")
);

-- CreateTable
CREATE TABLE "usuario_app_permissions" (
    "usuario_id" UUID NOT NULL,
    "app" "user_app" NOT NULL,
    "permission_profile_id" UUID NOT NULL,

    CONSTRAINT "usuario_app_permissions_pkey" PRIMARY KEY ("usuario_id","app")
);

-- CreateTable
CREATE TABLE "permission_profiles" (
    "id" UUID NOT NULL,
    "app" "user_app" NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "modules" "user_module"[] DEFAULT ARRAY[]::"user_module"[],
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "permission_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyectos" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "coordinates" JSONB NOT NULL,
    "ciudad" TEXT NOT NULL,
    "direccion" TEXT NOT NULL DEFAULT '',
    "identificador" TEXT NOT NULL,
    "codigo_proyecto" VARCHAR(4) NOT NULL DEFAULT lpad(nextval('proyecto_codigo_seq')::text, 4, '0'),
    "server_ip" TEXT NOT NULL DEFAULT '',
    "server_mac" TEXT NOT NULL DEFAULT '',
    "local_api_base_url" TEXT NOT NULL DEFAULT '',
    "installation_link_token_hash" TEXT NOT NULL DEFAULT '',
    "installation_link_token_encrypted" TEXT NOT NULL DEFAULT '',
    "installation_link_token_issued_at" TIMESTAMPTZ(3),
    "img" TEXT NOT NULL DEFAULT '',
    "descripcion" TEXT NOT NULL DEFAULT '',
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "proyectos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proyecto_remote_support" (
    "proyecto_id" UUID NOT NULL,
    "provider" "remote_support_provider" NOT NULL DEFAULT 'MESHCENTRAL',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "base_url" TEXT NOT NULL DEFAULT '',
    "group_id" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(3),

    CONSTRAINT "proyecto_remote_support_pkey" PRIMARY KEY ("proyecto_id")
);

-- CreateTable
CREATE TABLE "modulos" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "modulo_tipo" NOT NULL,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "identificador" TEXT NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '',
    "mac" TEXT NOT NULL DEFAULT '',
    "ubicacion" TEXT NOT NULL DEFAULT '',
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "modulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submodulos" (
    "id" UUID NOT NULL,
    "modulo_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "nombre" TEXT NOT NULL,
    "tipo" "submodulo_tipo" NOT NULL DEFAULT 'OTHER',
    "identificador" TEXT NOT NULL DEFAULT '',
    "ip" TEXT NOT NULL DEFAULT '',
    "mac" TEXT NOT NULL DEFAULT '',
    "ubicacion" TEXT NOT NULL DEFAULT '',
    "longitude" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "estado" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "submodulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modulo_remote_support" (
    "modulo_id" UUID NOT NULL,
    "provider" "remote_support_provider" NOT NULL DEFAULT 'MESHCENTRAL',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "device_name" TEXT NOT NULL DEFAULT '',
    "device_id" TEXT NOT NULL DEFAULT '',
    "group_id" TEXT NOT NULL DEFAULT '',
    "base_url" TEXT NOT NULL DEFAULT '',
    "support_url" TEXT NOT NULL DEFAULT '',
    "desktop_url" TEXT NOT NULL DEFAULT '',
    "terminal_url" TEXT NOT NULL DEFAULT '',
    "linked_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),

    CONSTRAINT "modulo_remote_support_pkey" PRIMARY KEY ("modulo_id")
);

-- CreateTable
CREATE TABLE "modulo_device_states" (
    "modulo_id" UUID NOT NULL,
    "binding" JSONB,
    "binding_requests" JSONB NOT NULL DEFAULT '[]',
    "connection_audit" JSONB,
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "socket_id" TEXT NOT NULL DEFAULT '',
    "ip_address" TEXT NOT NULL DEFAULT '',
    "location_label" TEXT NOT NULL DEFAULT '',
    "connection_status" "device_connection_status" NOT NULL DEFAULT 'PENDING',
    "heartbeat_status" "device_heartbeat_status" NOT NULL DEFAULT 'pending',
    "is_connected" BOOLEAN NOT NULL DEFAULT false,
    "is_authorized" BOOLEAN NOT NULL DEFAULT false,
    "connected_at" TIMESTAMPTZ(3),
    "last_heartbeat_at" TIMESTAMPTZ(3),
    "last_disconnect_at" TIMESTAMPTZ(3),
    "message" TEXT NOT NULL DEFAULT '',
    "source_installation_id" TEXT NOT NULL DEFAULT '',
    "synced_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "modulo_device_states_pkey" PRIMARY KEY ("modulo_id")
);

-- CreateTable
CREATE TABLE "pensiones" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" UUID,
    "cancellation_reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pensiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pension_horarios" (
    "pension_id" UUID NOT NULL,
    "week_day" SMALLINT NOT NULL,
    "from_minutes" SMALLINT NOT NULL,
    "to_minutes" SMALLINT NOT NULL,

    CONSTRAINT "pension_horarios_pkey" PRIMARY KEY ("pension_id","week_day")
);

-- CreateTable
CREATE TABLE "pension_passes" (
    "id" UUID NOT NULL,
    "pension_id" UUID NOT NULL,
    "usuario_id" UUID,
    "name" TEXT NOT NULL,
    "id_pass" TEXT NOT NULL,
    "vigent" BOOLEAN NOT NULL DEFAULT false,
    "anti_passback" BOOLEAN NOT NULL DEFAULT true,
    "in_parking" BOOLEAN NOT NULL DEFAULT false,
    "created" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_from" TIMESTAMPTZ(3),
    "valid_to" TIMESTAMPTZ(3),
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by" UUID,
    "cancellation_reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pension_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pension_pass_operations" (
    "key" TEXT NOT NULL,
    "pension_pass_id" UUID NOT NULL,
    "type" "pension_pass_operation_type" NOT NULL,
    "months" SMALLINT NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_to" TIMESTAMPTZ(3) NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pension_pass_operations_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "type" "payment_type" NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "payment_status" NOT NULL,
    "paid_at" TIMESTAMPTZ(3) NOT NULL,
    "stripe_payment_intent_id" TEXT,
    "idempotency_key" TEXT,
    "applied_operation_key" TEXT NOT NULL DEFAULT '',
    "applied_at" TIMESTAMPTZ(3),
    "reconciliation_status" "reconciliation_status" NOT NULL DEFAULT 'pending',
    "reconciled_at" TIMESTAMPTZ(3),
    "reconciliation_error" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "payment_method_brand" TEXT NOT NULL DEFAULT '',
    "payment_method_last4" VARCHAR(4) NOT NULL DEFAULT '',
    "reference_type" "payment_type" NOT NULL,
    "reference_id" TEXT NOT NULL,
    "proyecto_id" UUID,
    "parking_name" TEXT NOT NULL DEFAULT '',
    "parking_city" TEXT NOT NULL DEFAULT '',
    "raw_provider_status" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_installations" (
    "id" UUID NOT NULL,
    "installation_id" TEXT NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "local_api_base_url" TEXT NOT NULL DEFAULT '',
    "server_ip" TEXT NOT NULL DEFAULT '',
    "server_mac" TEXT NOT NULL DEFAULT '',
    "browser_longitude" DOUBLE PRECISION,
    "browser_latitude" DOUBLE PRECISION,
    "browser_location_accuracy" DOUBLE PRECISION,
    "browser_location_captured_at" TIMESTAMPTZ(3),
    "status" "installation_status" NOT NULL DEFAULT 'pending',
    "requested_by_user_id" TEXT NOT NULL DEFAULT '',
    "requested_by_user_name" TEXT NOT NULL DEFAULT '',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_user_id" UUID,
    "reviewed_by_user_name" TEXT NOT NULL DEFAULT '',
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" TEXT NOT NULL DEFAULT '',
    "sync_token_hash" TEXT NOT NULL DEFAULT '',
    "sync_token_issued_at" TIMESTAMPTZ(3),
    "sync_token_delivered_at" TIMESTAMPTZ(3),
    "last_command_poll_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "local_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_operations" (
    "operation_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "type" "mobile_operation_type" NOT NULL,
    "installation_id" TEXT NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "ticket_id" TEXT,
    "status" "mobile_operation_status" NOT NULL DEFAULT 'pending',
    "error" TEXT NOT NULL DEFAULT '',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "next_retry_at" TIMESTAMPTZ(3),
    "claimed_at" TIMESTAMPTZ(3),
    "last_attempt_at" TIMESTAMPTZ(3),
    "processing_deadline_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mobile_operations_pkey" PRIMARY KEY ("operation_id")
);

-- CreateTable
CREATE TABLE "inbox_events" (
    "event_id" TEXT NOT NULL,
    "installation_id" TEXT NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "processing_error" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "project_heartbeat_snapshots" (
    "proyecto_id" UUID NOT NULL,
    "installation_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "modules" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB,

    CONSTRAINT "project_heartbeat_snapshots_pkey" PRIMARY KEY ("proyecto_id")
);

-- CreateTable
CREATE TABLE "operational_incidents" (
    "incident_key" TEXT NOT NULL,
    "type" "incident_type" NOT NULL,
    "status" "incident_status" NOT NULL,
    "severity" "incident_severity" NOT NULL,
    "source" TEXT NOT NULL,
    "proyecto_id" UUID,
    "installation_id" TEXT NOT NULL DEFAULT '',
    "operation_id" TEXT NOT NULL DEFAULT '',
    "payment_id" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "opened_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "operational_incidents_pkey" PRIMARY KEY ("incident_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_telefono_key" ON "usuarios"("telefono");

-- CreateIndex
CREATE INDEX "usuarios_rol_idx" ON "usuarios"("rol");

-- CreateIndex
CREATE INDEX "usuario_parkings_proyecto_id_idx" ON "usuario_parkings"("proyecto_id");

-- CreateIndex
CREATE INDEX "usuario_app_permissions_permission_profile_id_idx" ON "usuario_app_permissions"("permission_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "permission_profiles_app_nombre_key" ON "permission_profiles"("app", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "proyectos_identificador_key" ON "proyectos"("identificador");

-- CreateIndex
CREATE UNIQUE INDEX "proyectos_codigo_proyecto_key" ON "proyectos"("codigo_proyecto");

-- CreateIndex
CREATE INDEX "proyectos_estado_idx" ON "proyectos"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "modulos_identificador_key" ON "modulos"("identificador");

-- CreateIndex
CREATE INDEX "modulos_proyecto_id_tipo_estado_idx" ON "modulos"("proyecto_id", "tipo", "estado");

-- CreateIndex
CREATE INDEX "submodulos_modulo_id_position_idx" ON "submodulos"("modulo_id", "position");

-- CreateIndex
CREATE INDEX "pensiones_proyecto_id_estado_idx" ON "pensiones"("proyecto_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "pension_passes_id_pass_key" ON "pension_passes"("id_pass");

-- CreateIndex
CREATE INDEX "pension_passes_available_idx" ON "pension_passes"("pension_id") WHERE (usuario_id IS NULL AND estado);

-- CreateIndex
CREATE INDEX "pension_passes_usuario_id_idx" ON "pension_passes"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "pension_passes_active_usuario_pension_key" ON "pension_passes"("usuario_id", "pension_id") WHERE (usuario_id IS NOT NULL AND estado);

-- CreateIndex
CREATE INDEX "pension_pass_operations_pension_pass_id_processed_at_idx" ON "pension_pass_operations"("pension_pass_id", "processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key" ON "payments"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_usuario_id_paid_at_idx" ON "payments"("usuario_id", "paid_at" DESC);

-- CreateIndex
CREATE INDEX "payments_reference_type_reference_id_idx" ON "payments"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "payments_unreconciled_idx" ON "payments"("paid_at") WHERE (stripe_payment_intent_id IS NOT NULL AND (status = 'pending' OR (status = 'succeeded' AND (reconciliation_status <> 'reconciled' OR applied_operation_key = ''))));

-- CreateIndex
CREATE UNIQUE INDEX "local_installations_installation_id_key" ON "local_installations"("installation_id");

-- CreateIndex
CREATE INDEX "local_installations_proyecto_id_status_idx" ON "local_installations"("proyecto_id", "status");

-- CreateIndex
CREATE INDEX "local_installations_status_last_command_poll_at_idx" ON "local_installations"("status", "last_command_poll_at");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_operations_idempotency_key_key" ON "mobile_operations"("idempotency_key");

-- CreateIndex
CREATE INDEX "mobile_operations_claimable_idx" ON "mobile_operations"("installation_id", "created_at") WHERE (status IN ('pending', 'failed'));

-- CreateIndex
CREATE INDEX "mobile_operations_installation_id_status_updated_at_idx" ON "mobile_operations"("installation_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "mobile_operations_usuario_id_completed_at_idx" ON "mobile_operations"("usuario_id", "completed_at" DESC);

-- CreateIndex
CREATE INDEX "mobile_operations_usuario_id_ticket_id_idx" ON "mobile_operations"("usuario_id", "ticket_id");

-- CreateIndex
CREATE INDEX "mobile_operations_status_updated_at_idx" ON "mobile_operations"("status", "updated_at");

-- CreateIndex
CREATE INDEX "inbox_events_proyecto_id_occurred_at_idx" ON "inbox_events"("proyecto_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "inbox_events_unprocessed_idx" ON "inbox_events"("received_at") WHERE (processed_at IS NULL);

-- CreateIndex
CREATE INDEX "project_heartbeat_snapshots_received_at_idx" ON "project_heartbeat_snapshots"("received_at");

-- CreateIndex
CREATE INDEX "operational_incidents_status_last_seen_at_idx" ON "operational_incidents"("status", "last_seen_at" DESC);

-- CreateIndex
CREATE INDEX "operational_incidents_type_status_idx" ON "operational_incidents"("type", "status");

-- CreateIndex
CREATE INDEX "operational_incidents_proyecto_id_idx" ON "operational_incidents"("proyecto_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rol_fkey" FOREIGN KEY ("rol") REFERENCES "roles"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_parkings" ADD CONSTRAINT "usuario_parkings_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_parkings" ADD CONSTRAINT "usuario_parkings_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_app_permissions" ADD CONSTRAINT "usuario_app_permissions_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_app_permissions" ADD CONSTRAINT "usuario_app_permissions_permission_profile_id_fkey" FOREIGN KEY ("permission_profile_id") REFERENCES "permission_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_remote_support" ADD CONSTRAINT "proyecto_remote_support_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulos" ADD CONSTRAINT "modulos_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submodulos" ADD CONSTRAINT "submodulos_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulo_remote_support" ADD CONSTRAINT "modulo_remote_support_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulo_device_states" ADD CONSTRAINT "modulo_device_states_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pensiones" ADD CONSTRAINT "pensiones_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pensiones" ADD CONSTRAINT "pensiones_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_horarios" ADD CONSTRAINT "pension_horarios_pension_id_fkey" FOREIGN KEY ("pension_id") REFERENCES "pensiones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_passes" ADD CONSTRAINT "pension_passes_pension_id_fkey" FOREIGN KEY ("pension_id") REFERENCES "pensiones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_passes" ADD CONSTRAINT "pension_passes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_passes" ADD CONSTRAINT "pension_passes_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pension_pass_operations" ADD CONSTRAINT "pension_pass_operations_pension_pass_id_fkey" FOREIGN KEY ("pension_pass_id") REFERENCES "pension_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_installations" ADD CONSTRAINT "local_installations_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_installations" ADD CONSTRAINT "local_installations_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_operations" ADD CONSTRAINT "mobile_operations_installation_id_fkey" FOREIGN KEY ("installation_id") REFERENCES "local_installations"("installation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_operations" ADD CONSTRAINT "mobile_operations_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_operations" ADD CONSTRAINT "mobile_operations_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_heartbeat_snapshots" ADD CONSTRAINT "project_heartbeat_snapshots_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_incidents" ADD CONSTRAINT "operational_incidents_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Added by hand: Prisma does not model sequences ownership, CHECK constraints or seed rows ───

ALTER SEQUENCE "proyecto_codigo_seq" OWNED BY "proyectos"."codigo_proyecto";

-- System roles. The API relies on these codes; permissions per app come from permission_profiles.
INSERT INTO "roles" ("code", "nombre", "descripcion", "sistema", "updated_at") VALUES
  ('SUPER_ROLE',   'Super administrador', 'Acceso total a todas las aplicaciones y estacionamientos', true, now()),
  ('ADMIN_ROLE',   'Administrador',       'Administra los estacionamientos asignados',                  true, now()),
  ('PENSION_ROLE', 'Pensiones',           'Gestiona pensiones de los estacionamientos asignados',       true, now()),
  ('CLIENT_ROLE',  'Cliente',             'Usuario final de la app móvil',                             true, now());

ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_correo_lowercase_check" CHECK ("correo" = lower("correo")),
  ADD CONSTRAINT "usuarios_coordinates_check" CHECK (("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180) AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90));

ALTER TABLE "proyectos"
  ADD CONSTRAINT "proyectos_codigo_proyecto_format_check" CHECK ("codigo_proyecto" ~ '^[0-9]{4}$');

ALTER TABLE "modulos"
  ADD CONSTRAINT "modulos_coordinates_check" CHECK (("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180) AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90));

ALTER TABLE "submodulos"
  ADD CONSTRAINT "submodulos_coordinates_check" CHECK (("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180) AND ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90));

ALTER TABLE "pensiones"
  ADD CONSTRAINT "pensiones_precio_check" CHECK ("precio" >= 0);

ALTER TABLE "pension_horarios"
  ADD CONSTRAINT "pension_horarios_week_day_check" CHECK ("week_day" BETWEEN 0 AND 6),
  ADD CONSTRAINT "pension_horarios_minutes_check" CHECK ("from_minutes" BETWEEN 0 AND 1439 AND "to_minutes" BETWEEN 0 AND 1439);

ALTER TABLE "pension_passes"
  ADD CONSTRAINT "pension_passes_validity_check" CHECK (("valid_from" IS NULL) = ("valid_to" IS NULL) AND ("valid_to" IS NULL OR "valid_to" >= "valid_from"));

ALTER TABLE "pension_pass_operations"
  ADD CONSTRAINT "pension_pass_operations_months_check" CHECK ("months" BETWEEN 0 AND 24),
  ADD CONSTRAINT "pension_pass_operations_validity_check" CHECK ("valid_to" >= "valid_from");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_check" CHECK ("amount" >= 0),
  ADD CONSTRAINT "payments_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "mobile_operations"
  ADD CONSTRAINT "mobile_operations_attempts_check" CHECK ("attempts" >= 0 AND "max_attempts" >= 1);
