-- Parking spaces per project (#54): optional, and never zero or negative.
-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "capacidad" INTEGER;

-- CreateIndex
CREATE INDEX "operational_pension_moves_proyecto_id_fecha_idx" ON "operational_pension_moves"("proyecto_id", "fecha");


ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_capacidad_check" CHECK ("capacidad" IS NULL OR "capacidad" > 0);
