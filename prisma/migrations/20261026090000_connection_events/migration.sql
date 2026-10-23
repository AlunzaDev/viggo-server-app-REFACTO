-- Connection history of installations and modules (REFACTO#63).
-- CreateTable
CREATE TABLE "connection_events" (
    "id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "installation_id" TEXT NOT NULL DEFAULT '',
    "modulo_id" UUID,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connection_events_proyecto_id_occurred_at_idx" ON "connection_events"("proyecto_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "connection_events_modulo_id_occurred_at_idx" ON "connection_events"("modulo_id", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "connection_events" ADD CONSTRAINT "connection_events_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_events" ADD CONSTRAINT "connection_events_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulos"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Installations change between online and offline; modules also go through pending.
ALTER TABLE "connection_events" ADD CONSTRAINT "connection_events_status_check" CHECK (
  "from_status" IN ('online', 'offline', 'pending') AND "to_status" IN ('online', 'offline', 'pending') AND "from_status" <> "to_status"
);
