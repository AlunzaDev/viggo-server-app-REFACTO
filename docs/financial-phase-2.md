# Financial phase 2 - automatic reconciliation

ADMINISTRATIVO includes a Stripe reconciliation worker. It runs every 15 minutes by default.

Configuration:

- `FINANCIAL_RECONCILIATION_WORKER_ENABLED=true|false`
- `FINANCIAL_RECONCILIATION_INTERVAL_MINUTES=15`
- `FINANCIAL_RECONCILIATION_BATCH_SIZE=50`

Current scope:

- Reviews payments with `stripePaymentIntentId` that are still `pending` or `succeeded` without completed reconciliation.
- Keeps payments pending when Stripe has not confirmed `succeeded`.
- Marks local payments as succeeded when Stripe confirms success.
- For mobile ticket payments, ensures an `APPLY_TICKET_PAYMENT` operation exists for the local operative server.
- For pension payments, applies contract or renew using an idempotent key derived from the PaymentIntent.
- Prevents overlapping runs inside the same process.

The worker does not create charges, does not charge again, and does not trust client-side amounts. It only reconciles existing payments.
