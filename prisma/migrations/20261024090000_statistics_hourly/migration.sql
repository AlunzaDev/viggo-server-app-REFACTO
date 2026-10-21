-- Statistics totals per parking and hour (#55, docs/estadisticas-carga.md).

-- CreateTable
CREATE TABLE "statistics_hourly_payments" (
    "proyecto_id" UUID NOT NULL,
    "hora" TIMESTAMPTZ(3) NOT NULL,
    "movimiento" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "pagos" INTEGER NOT NULL,

    CONSTRAINT "statistics_hourly_payments_pkey" PRIMARY KEY ("proyecto_id","hora","movimiento","metodo","tipo")
);

-- CreateTable
CREATE TABLE "statistics_hourly_tickets" (
    "proyecto_id" UUID NOT NULL,
    "hora" TIMESTAMPTZ(3) NOT NULL,
    "entradas" INTEGER NOT NULL,
    "salidas" INTEGER NOT NULL,
    "pagados" INTEGER NOT NULL,
    "monto_pagado" DECIMAL(14,2) NOT NULL,
    "estancias" INTEGER NOT NULL,
    "estancia_minutos" DOUBLE PRECISION NOT NULL,
    "estancia_buckets" INTEGER[],
    "estancia_bucket_minutos" DOUBLE PRECISION[],
    "estancia_ingresos" DECIMAL(14,2)[],

    CONSTRAINT "statistics_hourly_tickets_pkey" PRIMARY KEY ("proyecto_id","hora")
);

-- CreateTable
CREATE TABLE "statistics_hourly_pending" (
    "proyecto_id" UUID NOT NULL,
    "hora" TIMESTAMPTZ(3) NOT NULL,
    "marked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statistics_hourly_pending_pkey" PRIMARY KEY ("proyecto_id","hora")
);

-- CreateTable
CREATE TABLE "statistics_hourly_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "payments_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statistics_hourly_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operational_tickets_open_idx" ON "operational_tickets"("proyecto_id", "hora_inicio") WHERE (hora_salida IS NULL);

-- CreateIndex
CREATE INDEX "payments_proyecto_id_paid_at_idx" ON "payments"("proyecto_id", "paid_at");

-- CreateIndex
CREATE INDEX "payments_unassigned_paid_at_idx" ON "payments"("paid_at") WHERE (proyecto_id IS NULL);

-- CreateIndex
CREATE INDEX "payments_refunded_at_idx" ON "payments"("proyecto_id", "refunded_at") WHERE (refunded_at IS NOT NULL);

-- CreateIndex
CREATE INDEX "payments_unassigned_refunded_at_idx" ON "payments"("refunded_at") WHERE (proyecto_id IS NULL AND refunded_at IS NOT NULL);

-- CreateIndex
CREATE INDEX "payments_updated_at_idx" ON "payments"("updated_at");

-- AddForeignKey
ALTER TABLE "statistics_hourly_payments" ADD CONSTRAINT "statistics_hourly_payments_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "statistics_hourly_tickets" ADD CONSTRAINT "statistics_hourly_tickets_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- Where the scan of cloud payment changes starts.
INSERT INTO "statistics_hourly_state" ("id") VALUES (1);

-- Every hour that already has data is computed by the scheduler (or at once with
-- `npm run statistics:rebuild` on a large database).
INSERT INTO "statistics_hourly_pending" ("proyecto_id", "hora")
SELECT DISTINCT proyecto_id, date_trunc('hour', ts, 'UTC') FROM (
  SELECT proyecto_id, hora_inicio AS ts FROM "operational_tickets" WHERE hora_inicio IS NOT NULL
  UNION ALL SELECT proyecto_id, hora_salida FROM "operational_tickets" WHERE hora_salida IS NOT NULL
  UNION ALL SELECT proyecto_id, paid_at FROM "operational_payments" WHERE paid_at IS NOT NULL
  UNION ALL SELECT proyecto_id, paid_at FROM "statistics_payments" WHERE proyecto_id IS NOT NULL
  UNION ALL SELECT proyecto_id, refunded_at FROM "statistics_payments" WHERE proyecto_id IS NOT NULL AND refunded_at IS NOT NULL
) hours
WHERE proyecto_id IN (SELECT id FROM "proyectos")
ON CONFLICT DO NOTHING;
