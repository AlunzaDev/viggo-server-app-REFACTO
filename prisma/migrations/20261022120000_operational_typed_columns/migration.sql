-- Typed copies of what statistics filter and add up (docs/estadisticas.md): queries use
-- indexes instead of casting the JSON of every row. The inbox processor fills them on arrival.
-- AlterTable
ALTER TABLE "operational_payments" ADD COLUMN     "amount" DECIMAL(12,2),
ADD COLUMN     "currency" CHAR(3),
ADD COLUMN     "method" TEXT,
ADD COLUMN     "paid_at" TIMESTAMPTZ(3),
ADD COLUMN     "payment_type" TEXT,
ADD COLUMN     "provider_reference" TEXT,
ADD COLUMN     "status" TEXT;

-- AlterTable
ALTER TABLE "operational_tickets" ADD COLUMN     "hora_inicio" TIMESTAMPTZ(3),
ADD COLUMN     "hora_salida" TIMESTAMPTZ(3),
ADD COLUMN     "monto" DECIMAL(12,2),
ADD COLUMN     "pagado" BOOLEAN,
ADD COLUMN     "status" TEXT;

-- Backfill the rows already received. Malformed values stay NULL (the processor would
-- have held those events); impossible dates (before 2020 or in the future) too.
UPDATE "operational_payments" SET
  "paid_at" = CASE WHEN "payload"->>'paid_at' ~ '^\d{4}-\d{2}-\d{2}T' THEN ("payload"->>'paid_at')::timestamptz END,
  "amount" = CASE WHEN "payload"->>'amount' ~ '^-?\d{1,10}(\.\d{1,2})?$' THEN ("payload"->>'amount')::numeric END,
  "currency" = upper(left("payload"->>'currency', 3)),
  "status" = "payload"->>'status',
  "payment_type" = "payload"->>'type',
  "method" = CASE
    WHEN coalesce("payload"->>'provider_reference', '') LIKE 'pos\_session\_%' OR "payload"->>'raw_provider_status' = 'cash' THEN 'efectivo'
    WHEN coalesce("payload"->>'provider_reference', '') LIKE 'pi\_%' THEN 'tarjeta'
    ELSE 'sin_identificar' END,
  "provider_reference" = "payload"->>'provider_reference';
UPDATE "operational_payments" SET "paid_at" = NULL
WHERE "paid_at" < '2020-01-01' OR "paid_at" > now() + interval '1 day';

UPDATE "operational_tickets" SET
  "hora_inicio" = CASE WHEN "payload"->>'hora_inicio' ~ '^\d{4}-\d{2}-\d{2}T' THEN ("payload"->>'hora_inicio')::timestamptz END,
  "hora_salida" = CASE WHEN "payload"->>'hora_salida' ~ '^\d{4}-\d{2}-\d{2}T' THEN ("payload"->>'hora_salida')::timestamptz END,
  "monto" = CASE WHEN "payload"->>'monto' ~ '^-?\d{1,10}(\.\d{1,2})?$' THEN ("payload"->>'monto')::numeric END,
  "pagado" = CASE WHEN jsonb_typeof("payload"->'pagado') = 'boolean' THEN ("payload"->>'pagado')::boolean END,
  "status" = "payload"->>'status';
UPDATE "operational_tickets" SET "hora_inicio" = NULL
WHERE "hora_inicio" < '2020-01-01' OR "hora_inicio" > now() + interval '1 day';
UPDATE "operational_tickets" SET "hora_salida" = NULL
WHERE "hora_salida" < '2020-01-01' OR "hora_salida" > now() + interval '1 day';

-- CreateIndex
CREATE INDEX "operational_payments_proyecto_id_paid_at_idx" ON "operational_payments"("proyecto_id", "paid_at");

-- CreateIndex
CREATE INDEX "operational_payments_provider_reference_idx" ON "operational_payments"("provider_reference");

-- CreateIndex
CREATE INDEX "operational_tickets_proyecto_id_hora_inicio_idx" ON "operational_tickets"("proyecto_id", "hora_inicio");

-- CreateIndex
CREATE INDEX "operational_tickets_proyecto_id_hora_salida_idx" ON "operational_tickets"("proyecto_id", "hora_salida");

