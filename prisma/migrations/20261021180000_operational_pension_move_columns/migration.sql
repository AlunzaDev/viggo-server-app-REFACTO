-- The app's Pension Pass history looks moves up by pass: copy the pass and the passage time
-- out of the synchronized payload into indexed columns.
-- AlterTable
ALTER TABLE "operational_pension_moves" ADD COLUMN     "fecha" TIMESTAMPTZ(3),
ADD COLUMN     "pension_pass_id" UUID;

-- Backfill the rows already received (to_jsonb timestamps carry their offset).
UPDATE "operational_pension_moves"
SET "pension_pass_id" = ("payload"->>'pension_pass_id')::uuid,
    "fecha" = ("payload"->>'fecha')::timestamptz
WHERE "payload"->>'pension_pass_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND "payload"->>'fecha' ~ '^\d{4}-\d{2}-\d{2}T';

-- CreateIndex
CREATE INDEX "operational_pension_moves_proyecto_id_pension_pass_id_fecha_idx" ON "operational_pension_moves"("proyecto_id", "pension_pass_id", "fecha" DESC);
