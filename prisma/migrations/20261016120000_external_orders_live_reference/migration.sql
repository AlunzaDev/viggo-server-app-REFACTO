-- One live order per provider reference: an expired or refunded order frees the
-- reference so the same ticket can be quoted (and paid) again.
-- DropIndex
DROP INDEX "external_payment_orders_provider_reference_key";

-- CreateIndex
CREATE UNIQUE INDEX "external_payment_orders_live_reference_key" ON "external_payment_orders"("provider", "reference") WHERE (status <> 'expired' AND status <> 'refunded');
