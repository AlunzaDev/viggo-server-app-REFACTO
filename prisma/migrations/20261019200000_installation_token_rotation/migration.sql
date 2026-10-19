-- Rotation of an installation's sync token and the derived token ADMINISTRATIVO uses to
-- call the installation's local API (replaces the shared SYNC_SERVICE_TOKEN).
ALTER TABLE "local_installations"
ADD COLUMN "previous_sync_token_hash" TEXT NOT NULL DEFAULT '',
ADD COLUMN "sync_token_rotation_requested_at" TIMESTAMPTZ(3),
ADD COLUMN "admin_call_token_encrypted" TEXT NOT NULL DEFAULT '';
