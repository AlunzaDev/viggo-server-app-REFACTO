-- How an adapter provider's own API is spoken (requests and where each datum is in its answers).
-- AlterTable
ALTER TABLE "payment_providers" ADD COLUMN     "api_mapping" JSONB;

-- SeguriPass is no longer a coded adapter: it is configured with its mapping (#20).
UPDATE "payment_providers" SET "adapter" = '' WHERE "adapter" = 'seguripass';
