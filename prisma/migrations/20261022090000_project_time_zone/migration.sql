-- Time zone of each parking (IANA); existing projects keep the one they always used.
-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "zona_horaria" TEXT NOT NULL DEFAULT 'America/Mexico_City';

