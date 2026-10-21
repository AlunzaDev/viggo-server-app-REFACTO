-- Load dataset for statistics (docs/estadisticas-carga.md, #52).
--
-- Reproduces the volume measured in cobrocaja (docs/estadisticas.md §7): most parkings with
-- 550-850 tickets a day, one in ten with 2,000-2,700, by local hour, with their payments
-- (cash only in OPERATIVO, card in both the cloud and OPERATIVO), refunds and pension moves.
-- Same parameters and seed, same data.
--
--   psql -v sedes=120 -v dias=540 -v semilla=0.42 -f seed.sql
--
-- Only runs on a database whose name ends in _load: it fills tables, it never deletes.
\set ON_ERROR_STOP on

DO $$ BEGIN
  IF current_database() NOT LIKE '%\_load' THEN RAISE EXCEPTION 'Solo se genera carga en una base *_load (esta es %)', current_database(); END IF;
END $$;

SELECT setseed(:semilla);

-- Parameters and their working tables (unlogged: they are rebuilt on every run).
DROP TABLE IF EXISTS load_params, load_parkings, load_hours, load_day;
CREATE UNLOGGED TABLE load_params AS SELECT :sedes::int AS sedes, :dias::int AS dias, now() AS generado;

-- One user for every cloud charge, and 40 pensioners shared by the parkings.
INSERT INTO usuarios (id, nombre, apellido, correo, telefono, password, updated_at)
SELECT md5('load-user-' || n)::uuid, 'Carga', 'Usuario ' || n, 'carga-' || n || '@load.test', 'load' || lpad(n::text, 8, '0'), 'unused', now()
FROM generate_series(0, 40) n ON CONFLICT DO NOTHING;

-- Parkings: one in ten with heavy traffic, a few in other time zones, one in ten without capacity.
CREATE UNLOGGED TABLE load_parkings AS
SELECT n, md5('load-parking-' || n)::uuid AS id,
  CASE WHEN n % 20 = 7 THEN 'America/Tijuana' WHEN n % 20 = 13 THEN 'America/Cancun' ELSE 'America/Mexico_City' END AS zone,
  CASE WHEN n % 10 = 0 THEN 2000 + random() * 700 ELSE 550 + random() * 300 END AS daily
FROM generate_series(1, :sedes) n;

INSERT INTO proyectos (id, nombre, coordinates, ciudad, identificador, zona_horaria, capacidad, updated_at)
SELECT id, 'Carga ' || lpad(n::text, 3, '0'), '[0, 0]'::jsonb, 'Carga', 'load-' || n, zone,
  CASE WHEN n % 10 = 5 THEN NULL WHEN daily > 1500 THEN 600 ELSE 220 END, now()
FROM load_parkings ON CONFLICT DO NOTHING;

INSERT INTO pensiones (id, proyecto_id, nombre, precio, updated_at)
SELECT md5('load-pension-' || n)::uuid, id, 'Pensión mensual', 1500, now() FROM load_parkings ON CONFLICT DO NOTHING;

INSERT INTO pension_passes (id, pension_id, usuario_id, name, id_pass, vigent, valid_from, valid_to, updated_at)
SELECT md5('load-pass-' || p.n || '-' || u)::uuid, md5('load-pension-' || p.n)::uuid, md5('load-user-' || u)::uuid,
  'Pase ' || u, 'LOAD-' || p.n || '-' || u, true, now() - interval '15 days', now() + (1 + random() * 29) * interval '1 day', now()
FROM load_parkings p CROSS JOIN generate_series(1, 40) u ON CONFLICT DO NOTHING;

-- Share of the day's entries per local hour (morning and evening peaks).
CREATE UNLOGGED TABLE load_hours (h int, w float8);
INSERT INTO load_hours VALUES (0,.005),(1,.003),(2,.002),(3,.002),(4,.003),(5,.008),(6,.025),(7,.06),(8,.08),(9,.07),(10,.06),(11,.065),
  (12,.075),(13,.08),(14,.07),(15,.06),(16,.06),(17,.07),(18,.065),(19,.05),(20,.04),(21,.03),(22,.02),(23,.012);
UPDATE load_hours SET w = w / (SELECT sum(w) FROM load_hours);

CREATE UNLOGGED TABLE load_day (proyecto_id uuid, zone text, agg uuid, inicio timestamptz, salida timestamptz, monto numeric(12, 2), estado text, card boolean, refunded boolean);

-- Day by day, each committed: an interrupted run keeps the days already generated.
DO $$
DECLARE
  params record;
  day date;
  i int;
BEGIN
  SELECT * INTO params FROM load_params;
  FOR i IN 0 .. params.dias - 1 LOOP
    day := (params.generado AT TIME ZONE 'America/Mexico_City')::date - params.dias + i;
    TRUNCATE load_day;

    -- Entries of each parking and hour: its daily volume, weekend dip and ±15% noise.
    INSERT INTO load_day
    SELECT p.id, p.zone, md5(p.id::text || day || h.h || '-' || k)::uuid, t.inicio,
      CASE WHEN t.forgotten OR t.inicio + t.stay > params.generado THEN NULL ELSE t.inicio + t.stay END,
      CASE WHEN t.stay <= interval '15 minutes' THEN 0 ELSE LEAST(150, ceil(extract(epoch FROM t.stay) / 3600) * 15) END,
      CASE WHEN t.fraud THEN 'FRAUD' WHEN t.forgotten OR t.inicio + t.stay > params.generado THEN 'ACTIVE' ELSE 'COMPLETED' END,
      t.card, t.refunded
    FROM load_parkings p
    CROSS JOIN load_hours h
    CROSS JOIN LATERAL generate_series(1, round(p.daily * h.w * (CASE WHEN extract(isodow FROM day) >= 6 THEN 0.8 ELSE 1.05 END) * (0.85 + random() * 0.3))::int) k
    -- Its own random numbers per ticket (k keeps the subquery from being evaluated once).
    CROSS JOIN LATERAL (SELECT k AS kk, random() AS minute, random() AS kind, random() AS length, random() AS odd, random() AS pay OFFSET 0) r
    CROSS JOIN LATERAL (
      SELECT ((day + make_interval(hours => h.h, secs => r.minute * 3600))::timestamp AT TIME ZONE p.zone) AS inicio,
        CASE WHEN r.kind < 0.35 THEN 5 + r.length * 55 WHEN r.kind < 0.75 THEN 60 + r.length * 120
          WHEN r.kind < 0.95 THEN 180 + r.length * 300 ELSE 480 + r.length * 720 END * interval '1 minute' AS stay,
        r.odd < 0.002 AS forgotten, r.odd >= 0.002 AND r.odd < 0.003 AS fraud,
        r.pay < 0.15 AS card, r.pay < 0.0015 AS refunded
    ) t;

    INSERT INTO operational_tickets (proyecto_id, installation_id, aggregate_id, occurred_at, event_id, payload, hora_inicio, hora_salida, monto, pagado, status)
    SELECT proyecto_id, 'load', agg::text, COALESCE(salida, inicio), md5('ev-t-' || agg)::uuid::text,
      jsonb_build_object('id', agg, 'proyecto_id', proyecto_id, 'id_boleto', upper(substr(agg::text, 1, 12)), 'hora_inicio', inicio, 'hora_salida', salida,
        'monto', monto::text, 'pagado', salida IS NOT NULL AND monto > 0, 'status', estado, 'duracion', COALESCE(extract(epoch FROM salida - inicio)::int / 60, 0)),
      inicio, salida, monto, salida IS NOT NULL AND monto > 0, estado
    FROM load_day;

    -- OPERATIVO's payment of every paid ticket: cash (only here) or card (also in the cloud).
    INSERT INTO operational_payments (proyecto_id, installation_id, aggregate_id, occurred_at, event_id, payload, paid_at, amount, currency, status, payment_type, method, provider_reference)
    SELECT proyecto_id, 'load', md5('pay-' || agg)::uuid::text, salida, md5('ev-p-' || agg)::uuid::text,
      jsonb_build_object('id', md5('pay-' || agg)::uuid, 'type', 'ticket', 'amount', monto::text, 'currency', 'MXN', 'status', 'succeeded',
        'paid_at', salida - interval '2 minutes', 'reference_id', agg, 'provider_reference', CASE WHEN card THEN 'pi_load_' || md5(agg::text) ELSE 'pos_session_' || agg END),
      salida - interval '2 minutes', monto, 'MXN', 'succeeded', 'ticket', CASE WHEN card THEN 'tarjeta' ELSE 'efectivo' END,
      CASE WHEN card THEN 'pi_load_' || md5(agg::text) ELSE 'pos_session_' || agg END
    FROM load_day WHERE salida IS NOT NULL AND monto > 0;

    INSERT INTO payments (id, usuario_id, type, concept, amount, currency, status, paid_at, stripe_payment_intent_id, reference_type, reference_id, proyecto_id, refunded_at, updated_at)
    SELECT md5('cloud-' || agg)::uuid, md5('load-user-0')::uuid, 'ticket', 'carga', monto, 'MXN', CASE WHEN refunded THEN 'refunded' ELSE 'succeeded' END::payment_status,
      salida - interval '2 minutes', 'pi_load_' || md5(agg::text), 'ticket', agg::text, proyecto_id,
      CASE WHEN refunded THEN salida + interval '2 days' END, now()
    FROM load_day WHERE card AND salida IS NOT NULL AND monto > 0;

    -- Pensioners: each comes in the morning and leaves in the evening on 70% of the days.
    INSERT INTO operational_pension_moves (proyecto_id, installation_id, aggregate_id, occurred_at, event_id, payload, pension_pass_id, fecha)
    SELECT p.id, 'load', md5(p.id::text || day || u || m.tipo)::uuid::text, m.fecha, md5('ev-m-' || p.id || day || u || m.tipo)::uuid::text,
      jsonb_build_object('tipo', m.tipo, 'fecha', m.fecha, 'pension_pass_id', md5('load-pass-' || p.n || '-' || u)::uuid),
      md5('load-pass-' || p.n || '-' || u)::uuid, m.fecha
    FROM load_parkings p CROSS JOIN generate_series(1, 40) u
    CROSS JOIN LATERAL (SELECT u AS uu, (day + make_interval(hours => 7, secs => random() * 7200))::timestamp AT TIME ZONE p.zone AS entra,
      (day + make_interval(hours => 17, secs => random() * 7200))::timestamp AT TIME ZONE p.zone AS sale, random() < 0.7 AS viene OFFSET 0) x
    CROSS JOIN LATERAL (VALUES ('ENTRADA-PENSION', x.entra), ('SALIDA-PENSION', x.sale)) m(tipo, fecha)
    WHERE x.viene AND m.fecha <= params.generado;

    COMMIT;
    IF i % 30 = 0 OR i = params.dias - 1 THEN RAISE NOTICE '% dia % de %', clock_timestamp()::time(0), i + 1, params.dias; END IF;
  END LOOP;
END $$;

-- Each OPERATIVO sent something a minute ago (coverage), and statistics on the new rows.
INSERT INTO inbox_events (event_id, installation_id, proyecto_id, event_type, aggregate_id, occurred_at, payload, processed_at)
SELECT md5('load-heartbeat-' || id)::uuid::text, 'load', id, 'ticket.updated', md5('load-heartbeat-' || id)::uuid::text, now() - interval '1 minute', '{}', now()
FROM load_parkings ON CONFLICT DO NOTHING;

DROP TABLE load_day, load_hours;
ANALYZE;

SELECT 'operational_tickets' AS tabla, count(*) FROM operational_tickets
UNION ALL SELECT 'operational_payments', count(*) FROM operational_payments
UNION ALL SELECT 'payments', count(*) FROM payments
UNION ALL SELECT 'operational_pension_moves', count(*) FROM operational_pension_moves;
