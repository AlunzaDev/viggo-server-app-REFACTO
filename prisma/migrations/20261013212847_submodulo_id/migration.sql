-- Sub-module key used by the API (client-chosen or generated), unique per module.
-- AlterTable
ALTER TABLE "submodulos" ADD COLUMN     "submodulo_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "submodulos_modulo_id_submodulo_id_key" ON "submodulos"("modulo_id", "submodulo_id");

