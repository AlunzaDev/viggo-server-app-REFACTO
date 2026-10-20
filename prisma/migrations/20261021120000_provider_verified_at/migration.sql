-- Last successful connection test of a provider; an external provider is only active once tested.
-- AlterTable
ALTER TABLE "payment_providers" ADD COLUMN     "verified_at" TIMESTAMPTZ(3);

-- Providers already charging keep working: they count as tested.
UPDATE "payment_providers" SET "verified_at" = CURRENT_TIMESTAMP WHERE "integration" <> 'viggo' AND "active" = true;
