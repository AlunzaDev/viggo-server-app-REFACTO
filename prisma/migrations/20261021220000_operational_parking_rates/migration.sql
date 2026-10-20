-- Read-only copy of the parking rate versions each OPERATIVO configures (event parking_rate).
-- CreateTable
CREATE TABLE "operational_parking_rates" (
    "proyecto_id" UUID NOT NULL,
    "installation_id" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "source_position" BIGINT,
    "event_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "operational_parking_rates_pkey" PRIMARY KEY ("proyecto_id","installation_id","aggregate_id")
);

-- CreateIndex
CREATE INDEX "operational_parking_rates_proyecto_id_occurred_at_idx" ON "operational_parking_rates"("proyecto_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "operational_parking_rates" ADD CONSTRAINT "operational_parking_rates_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

