-- Release catalog, channels and reported versions (REFACTO#67).
-- AlterTable
ALTER TABLE "local_installations" ADD COLUMN     "reported_platform" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reported_version" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "version_reported_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "modulo_device_states" ADD COLUMN     "reported_platform" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reported_version" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "release_packages" (
    "id" UUID NOT NULL,
    "component" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "notas" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "release_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_channels" (
    "component" TEXT NOT NULL,
    "general_version" TEXT,
    "pilot_version" TEXT,
    "pilot_projects" UUID[] DEFAULT ARRAY[]::UUID[],
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "release_channels_pkey" PRIMARY KEY ("component")
);

-- CreateIndex
CREATE UNIQUE INDEX "release_packages_component_version_platform_key" ON "release_packages"("component", "version", "platform");


-- Only known components and platforms, MAJOR.MINOR.PATCH versions and sha256 digests.
ALTER TABLE "release_packages" ADD CONSTRAINT "release_packages_check" CHECK (
  "component" IN ('operativo', 'expendedora')
  AND "platform" IN ('linux/arm64', 'linux/amd64')
  AND "version" ~ '^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$'
  AND "digest" ~ '^sha256:[a-f0-9]{64}$'
);
ALTER TABLE "release_channels" ADD CONSTRAINT "release_channels_component_check" CHECK ("component" IN ('operativo', 'expendedora'));
