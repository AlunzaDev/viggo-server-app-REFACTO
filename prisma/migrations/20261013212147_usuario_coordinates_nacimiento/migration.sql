-- Keep user coordinates and birth instant exactly as the API receives them.
ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_coordinates_check";

-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "latitude",
DROP COLUMN "longitude",
ADD COLUMN     "coordinates" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
ALTER COLUMN "nacimiento" SET DATA TYPE TIMESTAMPTZ(3);

