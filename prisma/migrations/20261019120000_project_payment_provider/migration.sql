ALTER TABLE "proyectos"
ADD COLUMN "payment_provider" TEXT NOT NULL DEFAULT '',
ADD COLUMN "external_parking_id" TEXT NOT NULL DEFAULT '';
