-- Configurable payment providers (integration, API, encrypted credential) and the parking
-- (project) of each external order. provider now stores the catalog provider id.
-- CreateEnum
CREATE TYPE "payment_provider_integration" AS ENUM ('viggo', 'standard', 'adapter');

-- AlterTable
ALTER TABLE "external_payment_orders" ADD COLUMN     "proyecto_id" UUID,
ALTER COLUMN "provider" SET DATA TYPE VARCHAR(64);

-- AlterTable
ALTER TABLE "payment_providers" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "adapter" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "base_url" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "credential_encrypted" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "integration" "payment_provider_integration" NOT NULL DEFAULT 'viggo',
ADD COLUMN     "timeout_ms" INTEGER NOT NULL DEFAULT 8000;

-- CreateIndex
CREATE INDEX "external_payment_orders_proyecto_id_created_at_idx" ON "external_payment_orders"("proyecto_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "external_payment_orders" ADD CONSTRAINT "external_payment_orders_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

