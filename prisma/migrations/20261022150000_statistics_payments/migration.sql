-- Canonical payments for statistics (docs/estadisticas.md §4.1, #49).

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refunded_at" TIMESTAMPTZ(3);

-- Refunds count on the date they were made. Refunds made before this column existed get
-- their last update, the closest record of that moment.
UPDATE "payments" SET "refunded_at" = "updated_at" WHERE "status" = 'refunded' AND "refunded_at" IS NULL;

-- External charges belong to the parking where the QR was scanned; earlier ones were saved
-- without it.
UPDATE "payments" p SET "proyecto_id" = o."proyecto_id"
FROM "external_payment_orders" o
WHERE p."type" = 'external' AND p."proyecto_id" IS NULL AND o."id"::text = p."reference_id" AND o."proyecto_id" IS NOT NULL;

-- One row per real charge:
-- * Cloud payments (Stripe app payments, pensions, renewals, external orders) as they are:
--   Stripe is the source of truth and the only place refunds are seen.
-- * OPERATIVO's payments (cash, and app payments it applied) unless the cloud already has
--   that charge (same Stripe PaymentIntent): the cloud wins.
-- * Within OPERATIVO, one row per provider reference (or per row without one), the latest.
CREATE VIEW "statistics_payments" AS
WITH cloud AS (
  SELECT
    'nube'::text AS source,
    'nube:' || p."id"::text AS payment_key,
    COALESCE(p."proyecto_id", pe."proyecto_id", eo."proyecto_id") AS proyecto_id,
    p."paid_at",
    p."amount",
    p."currency"::text AS currency,
    p."status"::text AS status,
    p."type"::text AS payment_type,
    CASE WHEN p."stripe_payment_intent_id" IS NOT NULL THEN 'tarjeta' ELSE 'sin_identificar' END AS method,
    p."refunded_at",
    p."stripe_payment_intent_id" AS provider_reference
  FROM "payments" p
  LEFT JOIN "pension_passes" pp ON p."reference_type" IN ('pension', 'renewal') AND pp."id"::text = p."reference_id"
  LEFT JOIN "pensiones" pe ON pe."id" = pp."pension_id"
  LEFT JOIN "external_payment_orders" eo ON p."reference_type" = 'external' AND eo."id"::text = p."reference_id"
),
operational AS (
  SELECT DISTINCT ON (o."proyecto_id", COALESCE(o."provider_reference", o."installation_id" || ':' || o."aggregate_id"))
    'operativo'::text AS source,
    'operativo:' || o."proyecto_id"::text || ':' || COALESCE(o."provider_reference", o."installation_id" || ':' || o."aggregate_id") AS payment_key,
    o."proyecto_id",
    o."paid_at",
    o."amount",
    o."currency"::text AS currency,
    o."status",
    o."payment_type",
    o."method",
    NULL::timestamptz AS refunded_at,
    o."provider_reference"
  FROM "operational_payments" o
  WHERE o."paid_at" IS NOT NULL AND o."amount" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "payments" c
      WHERE o."provider_reference" IS NOT NULL AND c."stripe_payment_intent_id" = o."provider_reference"
    )
  ORDER BY o."proyecto_id", COALESCE(o."provider_reference", o."installation_id" || ':' || o."aggregate_id"),
    o."source_position" DESC NULLS LAST, o."occurred_at" DESC
)
SELECT * FROM cloud
UNION ALL
SELECT * FROM operational;
