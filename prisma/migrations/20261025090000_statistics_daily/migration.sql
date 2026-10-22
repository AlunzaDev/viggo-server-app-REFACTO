-- Statistics totals per parking and local day (#56, docs/estadisticas-carga.md §5).

-- CreateTable
CREATE TABLE "statistics_daily_payments" (
    "proyecto_id" UUID NOT NULL,
    "dia" DATE NOT NULL,
    "movimiento" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "pagos" INTEGER NOT NULL,

    CONSTRAINT "statistics_daily_payments_pkey" PRIMARY KEY ("proyecto_id","dia","movimiento","metodo","tipo")
);

-- CreateTable
CREATE TABLE "statistics_daily_tickets" (
    "proyecto_id" UUID NOT NULL,
    "dia" DATE NOT NULL,
    "entradas" INTEGER NOT NULL,
    "salidas" INTEGER NOT NULL,
    "entradas_hora" INTEGER[],
    "salidas_hora" INTEGER[],
    "pagados" INTEGER NOT NULL,
    "monto_pagado" DECIMAL(14,2) NOT NULL,
    "estancias" INTEGER NOT NULL,
    "estancia_minutos" DOUBLE PRECISION NOT NULL,
    "estancia_buckets" INTEGER[],
    "estancia_bucket_minutos" DOUBLE PRECISION[],
    "estancia_ingresos" DECIMAL(14,2)[],

    CONSTRAINT "statistics_daily_tickets_pkey" PRIMARY KEY ("proyecto_id","dia")
);

-- AddForeignKey
ALTER TABLE "statistics_daily_payments" ADD CONSTRAINT "statistics_daily_payments_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "statistics_daily_tickets" ADD CONSTRAINT "statistics_daily_tickets_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- The days of the hours already computed: each local day of each parking is the sum of its
-- hours (24, or 23 and 25 when the clocks change).
WITH days AS (
  SELECT DISTINCT h.proyecto_id, (h.hora AT TIME ZONE p.zona_horaria)::date AS dia, p.zona_horaria AS zone
  FROM (SELECT proyecto_id, hora FROM statistics_hourly_payments UNION SELECT proyecto_id, hora FROM statistics_hourly_tickets) h
  JOIN proyectos p ON p.id = h.proyecto_id
)
INSERT INTO statistics_daily_payments (proyecto_id, dia, movimiento, metodo, tipo, monto, pagos)
SELECT d.proyecto_id, d.dia, h.movimiento, h.metodo, h.tipo, sum(h.monto), sum(h.pagos)::int
FROM days d JOIN statistics_hourly_payments h ON h.proyecto_id = d.proyecto_id
  AND h.hora >= d.dia::timestamp AT TIME ZONE d.zone AND h.hora < (d.dia + 1)::timestamp AT TIME ZONE d.zone
GROUP BY 1, 2, 3, 4, 5;

WITH days AS (
  SELECT DISTINCT h.proyecto_id, (h.hora AT TIME ZONE p.zona_horaria)::date AS dia, p.zona_horaria AS zone
  FROM statistics_hourly_tickets h JOIN proyectos p ON p.id = h.proyecto_id
)
INSERT INTO statistics_daily_tickets (proyecto_id, dia, entradas, salidas, entradas_hora, salidas_hora, pagados, monto_pagado, estancias, estancia_minutos, estancia_buckets, estancia_bucket_minutos, estancia_ingresos)
SELECT d.proyecto_id, d.dia, sum(h.entradas)::int, sum(h.salidas)::int,
  ARRAY[COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 0), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 1), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 2), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 3), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 4), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 5), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 6), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 7), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 8), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 9), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 10), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 11), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 12), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 13), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 14), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 15), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 16), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 17), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 18), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 19), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 20), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 21), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 22), 0)::int, COALESCE(sum(h.entradas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 23), 0)::int]::int[],
  ARRAY[COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 0), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 1), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 2), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 3), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 4), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 5), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 6), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 7), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 8), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 9), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 10), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 11), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 12), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 13), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 14), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 15), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 16), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 17), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 18), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 19), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 20), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 21), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 22), 0)::int, COALESCE(sum(h.salidas) FILTER (WHERE extract(hour FROM h.hora AT TIME ZONE d.zone) = 23), 0)::int]::int[],
  sum(h.pagados)::int, sum(h.monto_pagado), sum(h.estancias)::int, sum(h.estancia_minutos)::float8,
  ARRAY[sum(h.estancia_buckets[1]), sum(h.estancia_buckets[2]), sum(h.estancia_buckets[3]), sum(h.estancia_buckets[4]), sum(h.estancia_buckets[5]), sum(h.estancia_buckets[6]), sum(h.estancia_buckets[7]), sum(h.estancia_buckets[8]), sum(h.estancia_buckets[9]), sum(h.estancia_buckets[10]), sum(h.estancia_buckets[11]), sum(h.estancia_buckets[12]), sum(h.estancia_buckets[13]), sum(h.estancia_buckets[14]), sum(h.estancia_buckets[15]), sum(h.estancia_buckets[16]), sum(h.estancia_buckets[17]), sum(h.estancia_buckets[18])]::int[],
  ARRAY[sum(h.estancia_bucket_minutos[1]), sum(h.estancia_bucket_minutos[2]), sum(h.estancia_bucket_minutos[3]), sum(h.estancia_bucket_minutos[4]), sum(h.estancia_bucket_minutos[5]), sum(h.estancia_bucket_minutos[6]), sum(h.estancia_bucket_minutos[7]), sum(h.estancia_bucket_minutos[8]), sum(h.estancia_bucket_minutos[9]), sum(h.estancia_bucket_minutos[10]), sum(h.estancia_bucket_minutos[11]), sum(h.estancia_bucket_minutos[12]), sum(h.estancia_bucket_minutos[13]), sum(h.estancia_bucket_minutos[14]), sum(h.estancia_bucket_minutos[15]), sum(h.estancia_bucket_minutos[16]), sum(h.estancia_bucket_minutos[17]), sum(h.estancia_bucket_minutos[18])]::float8[],
  ARRAY[sum(h.estancia_ingresos[1]), sum(h.estancia_ingresos[2]), sum(h.estancia_ingresos[3]), sum(h.estancia_ingresos[4])]::numeric(14, 2)[]
FROM days d JOIN statistics_hourly_tickets h ON h.proyecto_id = d.proyecto_id
  AND h.hora >= d.dia::timestamp AT TIME ZONE d.zone AND h.hora < (d.dia + 1)::timestamp AT TIME ZONE d.zone
GROUP BY 1, 2;
