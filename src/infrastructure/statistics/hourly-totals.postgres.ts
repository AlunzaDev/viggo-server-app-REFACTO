import { PostgresDatabase } from "../../data/postgres";
import { Prisma } from "../../generated/prisma/client";
import { HourlyTotalsStore } from "../../domain/statistics/hourly-totals";
import { BUCKET_COUNT, paymentRows, rangeIncome, stayBucket, ticketEntryRows, ticketExitRows } from "./hourly-sql";

type Db = Prisma.TransactionClient | typeof PostgresDatabase.client;

/** A change committed this long before the last scan may still have been in flight: scan again. */
const RESCAN_MS = 2 * 60_000;

/** Hours of `instants` (null ones ignored) of a parking, marked to be recomputed. */
export const markHourlyPending = async (db: Db, proyectoId: string, instants: Array<Date | null | undefined>) => {
  const hours = instants.filter((value): value is Date => value instanceof Date && Number.isFinite(value.getTime()));
  if (!hours.length) return;
  await db.$executeRaw(Prisma.sql`
    INSERT INTO statistics_hourly_pending (proyecto_id, hora, marked_at)
    SELECT ${proyectoId}::uuid, hora, clock_timestamp()
    FROM (SELECT DISTINCT date_trunc('hour', t, 'UTC') AS hora FROM unnest(ARRAY[${Prisma.join(hours)}]::timestamptz[]) AS t) h
    ON CONFLICT (proyecto_id, hora) DO UPDATE SET marked_at = EXCLUDED.marked_at`);
};

/** Deletes and inserts the totals of every hour inside the `windows` CTE. */
const recompute = async (db: Db, windows: Prisma.Sql) => {
  // Estimated far above its cost: compiling it (JIT) would take longer than running it.
  await db.$executeRaw`SET LOCAL jit = off`;
  await db.$executeRaw(Prisma.sql`WITH ${windows}
    DELETE FROM statistics_hourly_payments h USING windows w
    WHERE h.proyecto_id = w.proyecto_id AND h.hora >= w.w_start AND h.hora < w.w_end`);
  await db.$executeRaw(Prisma.sql`WITH ${windows}
    DELETE FROM statistics_hourly_tickets h USING windows w
    WHERE h.proyecto_id = w.proyecto_id AND h.hora >= w.w_start AND h.hora < w.w_end`);
  await db.$executeRaw(Prisma.sql`WITH ${windows}
    INSERT INTO statistics_hourly_payments (proyecto_id, hora, movimiento, metodo, tipo, monto, pagos)
    SELECT proyecto_id, date_trunc('hour', ts, 'UTC'), movimiento, COALESCE(metodo, ''), COALESCE(tipo, ''), sum(monto), count(*)::int
    FROM (${paymentRows}) r GROUP BY 1, 2, 3, 4, 5`);
  const zeros = Prisma.raw(`ARRAY[${Array(BUCKET_COUNT).fill(0).join(",")}]::int[]`);
  await db.$executeRaw(Prisma.sql`WITH ${windows},
    entries AS (
      SELECT proyecto_id, date_trunc('hour', ts, 'UTC') AS hora, count(*)::int AS entradas
      FROM (${ticketEntryRows}) r GROUP BY 1, 2
    ),
    exits AS (
      SELECT proyecto_id, date_trunc('hour', ts, 'UTC') AS hora, count(*)::int AS salidas,
        count(*) FILTER (WHERE pagado)::int AS pagados, COALESCE(sum(monto) FILTER (WHERE pagado), 0) AS monto_pagado,
        count(minutos)::int AS estancias, COALESCE(sum(minutos), 0)::float8 AS estancia_minutos,
        ARRAY[${Prisma.join(Array.from({ length: BUCKET_COUNT }, (_, index) => Prisma.sql`count(*) FILTER (WHERE bucket = ${index + 1})::int`))}] AS estancia_buckets,
        ARRAY[${Prisma.join(Array.from({ length: BUCKET_COUNT }, (_, index) => Prisma.sql`COALESCE(sum(minutos) FILTER (WHERE bucket = ${index + 1}), 0)::float8`))}] AS estancia_bucket_minutos,
        ${rangeIncome((value) => Prisma.sql`COALESCE(sum(${value}), 0)::numeric(14, 2)`)} AS estancia_ingresos
      FROM (SELECT x.*, CASE WHEN minutos IS NOT NULL THEN ${stayBucket(Prisma.sql`minutos`)} END AS bucket FROM (${ticketExitRows}) x) r
      GROUP BY 1, 2
    )
    INSERT INTO statistics_hourly_tickets (proyecto_id, hora, entradas, salidas, pagados, monto_pagado, estancias, estancia_minutos, estancia_buckets, estancia_bucket_minutos, estancia_ingresos)
    SELECT COALESCE(e.proyecto_id, x.proyecto_id), COALESCE(e.hora, x.hora), COALESCE(e.entradas, 0), COALESCE(x.salidas, 0),
      COALESCE(x.pagados, 0), COALESCE(x.monto_pagado, 0), COALESCE(x.estancias, 0), COALESCE(x.estancia_minutos, 0),
      COALESCE(x.estancia_buckets, ${zeros}), COALESCE(x.estancia_bucket_minutos, ${zeros}::float8[]), COALESCE(x.estancia_ingresos, ARRAY[0, 0, 0, 0]::numeric(14, 2)[])
    FROM entries e FULL JOIN exits x ON x.proyecto_id = e.proyecto_id AND x.hora = e.hora`);
};

export class HourlyTotalsPostgres extends HourlyTotalsStore {
  async refresh(now: number, limit: number): Promise<number> {
    await this.markCloudPaymentChanges();
    return PostgresDatabase.client.$transaction(async (tx) => {
      // Locked until committed: a change to one of these hours that arrives meanwhile marks
      // it again after this transaction, so it is never lost.
      const pending = await tx.$queryRaw<Array<{ proyecto_id: string; hora: Date }>>(Prisma.sql`
        SELECT proyecto_id::text, hora FROM statistics_hourly_pending
        WHERE proyecto_id IN (SELECT id FROM proyectos)
        ORDER BY hora LIMIT ${limit} FOR UPDATE SKIP LOCKED`);
      if (!pending.length) {
        // Hours of deleted parkings are never computed.
        await tx.$executeRaw`DELETE FROM statistics_hourly_pending WHERE proyecto_id NOT IN (SELECT id FROM proyectos)`;
        return 0;
      }
      const values = Prisma.join(pending.map((row) => Prisma.sql`(${row.proyecto_id}::uuid, ${row.hora}::timestamptz)`));
      await recompute(tx, Prisma.sql`windows AS (
        SELECT proyecto_id, hora AS w_start, hora + interval '1 hour' AS w_end FROM (VALUES ${values}) v(proyecto_id, hora))`);
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM statistics_hourly_pending p USING (VALUES ${values}) v(proyecto_id, hora)
        WHERE p.proyecto_id = v.proyecto_id AND p.hora = v.hora`);
      return pending.length;
    }, { timeout: 120_000 });
  }

  async rebuild(proyectos: string[] | null, from: number, to: number): Promise<void> {
    const start = new Date(Math.floor(from / 3_600_000) * 3_600_000), end = new Date(Math.ceil(to / 3_600_000) * 3_600_000);
    const parkings = proyectos ? Prisma.sql`WHERE id IN (${Prisma.join(proyectos.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty;
    if (proyectos && !proyectos.length) return;
    await PostgresDatabase.client.$transaction(async (tx) => {
      await recompute(tx, Prisma.sql`windows AS (SELECT id AS proyecto_id, ${start}::timestamptz AS w_start, ${end}::timestamptz AS w_end FROM proyectos ${parkings})`);
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM statistics_hourly_pending WHERE hora >= ${start} AND hora < ${end}
          ${proyectos ? Prisma.sql`AND proyecto_id IN (${Prisma.join(proyectos.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty}`);
    }, { timeout: 30 * 60_000 });
  }

  /**
   * Cloud payments change outside the inbox (app payments, Stripe, refunds, pensions): the hours
   * of the ones updated since the last scan are marked, and the OPERATIVO copies of the same
   * charges too (the cloud's record replaces them).
   */
  private async markCloudPaymentChanges() {
    await PostgresDatabase.client.$transaction(async (tx) => {
      const [state] = await tx.$queryRaw<Array<{ seen: Date }>>`
        SELECT payments_seen_at AS seen FROM statistics_hourly_state WHERE id = 1 FOR UPDATE`;
      const since = new Date((state?.seen ?? new Date(0)).getTime() - RESCAN_MS);
      await tx.$executeRaw(Prisma.sql`
        WITH changed AS (SELECT * FROM payments WHERE updated_at > ${since}),
        hours AS (
          SELECT COALESCE(c.proyecto_id, pe.proyecto_id, eo.proyecto_id) AS proyecto_id, v.t
          FROM changed c
          LEFT JOIN pension_passes pp ON c.reference_type IN ('pension', 'renewal') AND pp.id::text = c.reference_id
          LEFT JOIN pensiones pe ON pe.id = pp.pension_id
          LEFT JOIN external_payment_orders eo ON c.reference_type = 'external' AND eo.id::text = c.reference_id
          CROSS JOIN LATERAL (VALUES (c.paid_at), (c.refunded_at)) v(t)
          UNION ALL
          SELECT o.proyecto_id, o.paid_at FROM changed c JOIN operational_payments o ON o.provider_reference = c.stripe_payment_intent_id
        )
        INSERT INTO statistics_hourly_pending (proyecto_id, hora, marked_at)
        SELECT proyecto_id, hora, clock_timestamp() FROM (
          SELECT DISTINCT proyecto_id, date_trunc('hour', t, 'UTC') AS hora FROM hours
          WHERE t IS NOT NULL AND proyecto_id IN (SELECT id FROM proyectos)
        ) h
        ON CONFLICT (proyecto_id, hora) DO UPDATE SET marked_at = EXCLUDED.marked_at`);
      await tx.$executeRaw`
        INSERT INTO statistics_hourly_state (id, payments_seen_at) VALUES (1, now())
        ON CONFLICT (id) DO UPDATE SET payments_seen_at = EXCLUDED.payments_seen_at`;
    }, { timeout: 60_000 });
  }
}
