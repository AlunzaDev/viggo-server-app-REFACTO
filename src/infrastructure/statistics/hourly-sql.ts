import { Prisma } from "../../generated/prisma/client";

/**
 * The rows statistics add up, for the periods of a `windows` CTE (proyecto_id, w_start, w_end).
 * Each window is read on its own (LATERAL), so the period reaches the indexes as real bounds:
 * through the `statistics_payments` view it did not, and every query read every payment
 * (docs/estadisticas-carga.md §4). The rules are the view's (docs/estadisticas.md §4.1, §4.3).
 * `OFFSET 0` keeps PostgreSQL from flattening each LATERAL into a join over the whole table.
 */

/** Minutes where each stay histogram bucket ends (the last one has no end). Aligned with 1, 3 and 8 h. */
export const STAY_BUCKETS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480, 600, 720, 960, 1440] as const;
/** Buckets of each stay range of the dashboard: < 1 h, 1-3 h, 3-8 h, 8 h+ (1-based, inclusive). */
export const STAY_RANGES = [
  { rango: "< 1 Hora", desde: 0, hasta: 60, buckets: [1, 4] },
  { rango: "1 - 3 Horas", desde: 60, hasta: 180, buckets: [5, 8] },
  { rango: "3 - 8 Horas", desde: 180, hasta: 480, buckets: [9, 13] },
  { rango: "8+ Horas", desde: 480, hasta: null, buckets: [14, 18] },
] as const;
export const BUCKET_COUNT = STAY_BUCKETS.length + 1;

const bucketEdges = Prisma.raw(`ARRAY[${STAY_BUCKETS.join(",")}]::float8[]`);
/** 1-based histogram bucket of `minutes`. */
export const stayBucket = (minutes: Prisma.Sql) => Prisma.sql`width_bucket(${minutes}, ${bucketEdges}) + 1`;

const cloudMethod = Prisma.sql`CASE WHEN p.stripe_payment_intent_id IS NOT NULL THEN 'tarjeta' ELSE 'sin_identificar' END`;
/** Cloud payments without a parking take their pension's or external order's. */
const cloudParking = Prisma.sql`
  LEFT JOIN pension_passes pp ON p.reference_type IN ('pension', 'renewal') AND pp.id::text = p.reference_id
  LEFT JOIN pensiones pe ON pe.id = pp.pension_id
  LEFT JOIN external_payment_orders eo ON p.reference_type = 'external' AND eo.id::text = p.reference_id`;

/**
 * Charges (`cobro`, at paid_at) and refunds (`reembolso`, at refunded_at) in MXN of each window,
 * one row per real charge: the cloud's record wins over OPERATIVO's copy of the same charge,
 * and within OPERATIVO the latest row of each provider reference counts.
 * Columns: proyecto_id, ts, movimiento, metodo, tipo, monto.
 */
export const paymentRows = Prisma.sql`
  SELECT w.proyecto_id, x.ts, x.movimiento, x.metodo, x.tipo, x.monto
  FROM windows w
  CROSS JOIN LATERAL (
    SELECT o.paid_at AS ts, 'cobro' AS movimiento, o.method AS metodo, o.payment_type AS tipo, o.amount AS monto
    FROM operational_payments o
    WHERE o.proyecto_id = w.proyecto_id AND o.paid_at >= w.w_start AND o.paid_at < w.w_end
      AND o.amount IS NOT NULL AND o.currency = 'MXN' AND o.status IN ('succeeded', 'refunded')
      AND NOT EXISTS (SELECT 1 FROM payments c WHERE o.provider_reference IS NOT NULL AND c.stripe_payment_intent_id = o.provider_reference)
      AND NOT EXISTS (
        SELECT 1 FROM operational_payments n
        WHERE o.provider_reference IS NOT NULL AND n.proyecto_id = o.proyecto_id AND n.provider_reference = o.provider_reference
          AND n.paid_at IS NOT NULL AND n.amount IS NOT NULL
          AND (COALESCE(n.source_position, -1), n.occurred_at, n.installation_id, n.aggregate_id)
            > (COALESCE(o.source_position, -1), o.occurred_at, o.installation_id, o.aggregate_id))
    UNION ALL
    SELECT p.paid_at, 'cobro', ${cloudMethod}, p.type::text, p.amount
    FROM payments p
    WHERE p.proyecto_id = w.proyecto_id AND p.paid_at >= w.w_start AND p.paid_at < w.w_end
      AND p.currency::text = 'MXN' AND p.status IN ('succeeded', 'refunded')
    UNION ALL
    SELECT p.paid_at, 'cobro', ${cloudMethod}, p.type::text, p.amount
    FROM payments p ${cloudParking}
    WHERE p.proyecto_id IS NULL AND p.paid_at >= w.w_start AND p.paid_at < w.w_end
      AND COALESCE(pe.proyecto_id, eo.proyecto_id) = w.proyecto_id
      AND p.currency::text = 'MXN' AND p.status IN ('succeeded', 'refunded')
    UNION ALL
    SELECT p.refunded_at, 'reembolso', ${cloudMethod}, p.type::text, p.amount
    FROM payments p
    WHERE p.proyecto_id = w.proyecto_id AND p.refunded_at >= w.w_start AND p.refunded_at < w.w_end
      AND p.currency::text = 'MXN' AND p.status = 'refunded'
    UNION ALL
    SELECT p.refunded_at, 'reembolso', ${cloudMethod}, p.type::text, p.amount
    FROM payments p ${cloudParking}
    WHERE p.proyecto_id IS NULL AND p.refunded_at >= w.w_start AND p.refunded_at < w.w_end
      AND COALESCE(pe.proyecto_id, eo.proyecto_id) = w.proyecto_id
      AND p.currency::text = 'MXN' AND p.status = 'refunded'
    OFFSET 0
  ) x`;

/** Tickets with entry in each window. Columns: proyecto_id, ts. */
export const ticketEntryRows = Prisma.sql`
  SELECT w.proyecto_id, t.hora_inicio AS ts
  FROM windows w
  CROSS JOIN LATERAL (
    SELECT ot.hora_inicio FROM operational_tickets ot
    WHERE ot.proyecto_id = w.proyecto_id AND ot.hora_inicio >= w.w_start AND ot.hora_inicio < w.w_end
    OFFSET 0
  ) t`;

/**
 * Tickets with exit in each window: whether paid with an amount (average ticket), and the stay
 * when it is valid (entry known, exit not before it) with its income (the amount if paid).
 * Columns: proyecto_id, ts, pagado, monto, minutos (null if no valid stay), ingreso.
 */
export const ticketExitRows = Prisma.sql`
  SELECT w.proyecto_id, t.hora_salida AS ts, (t.pagado AND t.monto IS NOT NULL) AS pagado, COALESCE(t.monto, 0) AS monto,
    CASE WHEN t.hora_inicio IS NOT NULL AND t.hora_salida >= t.hora_inicio THEN extract(epoch FROM t.hora_salida - t.hora_inicio) / 60 END AS minutos,
    CASE WHEN t.pagado THEN COALESCE(t.monto, 0) ELSE 0 END AS ingreso
  FROM windows w
  CROSS JOIN LATERAL (
    SELECT ot.hora_inicio, ot.hora_salida, ot.pagado, ot.monto FROM operational_tickets ot
    WHERE ot.proyecto_id = w.proyecto_id AND ot.hora_salida >= w.w_start AND ot.hora_salida < w.w_end
    OFFSET 0
  ) t`;

/** Per-range income of a stay row (`minutos`, `ingreso`), as a numeric[4]. */
export const rangeIncome = (agg: (value: Prisma.Sql) => Prisma.Sql) => Prisma.sql`ARRAY[${Prisma.join(STAY_RANGES.map((range) => agg(Prisma.sql`
  CASE WHEN minutos >= ${range.desde} ${range.hasta === null ? Prisma.empty : Prisma.sql`AND minutos < ${range.hasta}`} THEN ingreso ELSE 0 END`)))}]`;
