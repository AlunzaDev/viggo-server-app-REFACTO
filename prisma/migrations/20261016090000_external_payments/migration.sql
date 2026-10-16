-- CreateEnum
CREATE TYPE "external_order_status" AS ENUM ('quoted', 'payment_pending', 'paid', 'confirmed', 'confirmation_failed', 'expired', 'refunded');

-- AlterEnum
ALTER TYPE "payment_type" ADD VALUE 'external';

-- AlterEnum
ALTER TYPE "incident_type" ADD VALUE 'EXTERNAL_PAYMENT_REVIEW';

-- CreateTable
CREATE TABLE "external_payment_orders" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "reference" VARCHAR(256) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "ticket" TEXT NOT NULL,
    "parking_id" TEXT NOT NULL,
    "parking_name" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "external_order_status" NOT NULL DEFAULT 'quoted',
    "stripe_payment_intent_id" TEXT,
    "intent_started_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_owner" TEXT NOT NULL DEFAULT '',
    "lease_until" TIMESTAMPTZ(3),
    "confirmation_reference" TEXT NOT NULL DEFAULT '',
    "last_error" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "external_payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_payment_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_payment_orders_stripe_payment_intent_id_key" ON "external_payment_orders"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "external_payment_orders_status_next_retry_at_idx" ON "external_payment_orders"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "external_payment_orders_usuario_id_created_at_idx" ON "external_payment_orders"("usuario_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "external_payment_orders_provider_reference_key" ON "external_payment_orders"("provider", "reference");

-- CreateIndex
CREATE INDEX "external_payment_events_order_id_created_at_idx" ON "external_payment_events"("order_id", "created_at");

-- AddForeignKey
ALTER TABLE "external_payment_orders" ADD CONSTRAINT "external_payment_orders_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_payment_events" ADD CONSTRAINT "external_payment_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "external_payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Initial settlement contract: MXN only, $10.00 minimum, integer cents.
ALTER TABLE "external_payment_orders"
  ADD CONSTRAINT "external_orders_amount_check" CHECK (amount_minor BETWEEN 1000 AND 99999999),
  ADD CONSTRAINT "external_orders_currency_check" CHECK (currency = 'MXN'),
  ADD CONSTRAINT "external_orders_attempts_check" CHECK (attempts >= 0);
