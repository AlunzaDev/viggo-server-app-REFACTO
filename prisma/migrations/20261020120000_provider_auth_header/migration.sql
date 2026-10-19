-- Header a provider's credential is sent in (empty: Authorization: Bearer).
-- AlterTable
ALTER TABLE "payment_providers" ADD COLUMN     "auth_header" TEXT NOT NULL DEFAULT '';

