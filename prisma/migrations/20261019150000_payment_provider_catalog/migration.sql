CREATE TABLE "payment_providers" (
  "id" UUID NOT NULL,
  "nombre" TEXT NOT NULL,
  "logo" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "payment_providers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_providers_nombre_key" ON "payment_providers"("nombre");
ALTER TABLE "proyectos" ADD COLUMN "payment_provider_id" UUID;
CREATE INDEX "proyectos_payment_provider_id_idx" ON "proyectos"("payment_provider_id");
ALTER TABLE "proyectos" ADD CONSTRAINT "proyectos_payment_provider_id_fkey"
  FOREIGN KEY ("payment_provider_id") REFERENCES "payment_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "payment_providers" ("id", "nombre", "logo", "updated_at")
VALUES ('019a0000-0000-7000-8000-000000000001', 'SEGURIPASS', '', CURRENT_TIMESTAMP)
ON CONFLICT ("nombre") DO NOTHING;
