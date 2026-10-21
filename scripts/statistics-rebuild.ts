/**
 * Recomputes the statistics totals per hour (docs/estadisticas-carga.md §5) of a period, for
 * a database with history: after the migration, or to repair a period. The scheduler does the
 * same hour by hour, much slower.
 *
 *   npm run statistics:rebuild -- [--desde 2026-01-01] [--hasta 2026-10-21] [--proyectos id1,id2]
 *
 * Without --desde it starts at the oldest ticket or payment; without --hasta, now.
 */
import { config as loadDotenv } from "dotenv";
import { PostgresDatabase } from "../src/data/postgres";
import { buildHourlyTotalsStore } from "../src/presentation/dependencies/repositories.dependencies";

loadDotenv({ path: ".env.dev", quiet: true });

const DAY = 86_400_000;
const CHUNK = 7 * DAY;

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const db = await PostgresDatabase.connect({ databaseUrl, poolMax: 2 });
  const totals = buildHourlyTotalsStore();

  const requested = arg("proyectos")?.split(",").map((id) => id.trim()).filter(Boolean);
  const parkings = requested ?? (await db.proyecto.findMany({ select: { id: true }, orderBy: { identificador: "asc" } })).map((row) => row.id);
  const [oldest] = await db.$queryRaw<Array<{ at: Date | null }>>`
    SELECT LEAST((SELECT min(hora_inicio) FROM operational_tickets), (SELECT min(paid_at) FROM operational_payments), (SELECT min(paid_at) FROM payments)) AS at`;
  const from = arg("desde") ? Date.parse(`${arg("desde")}T00:00:00Z`) : (oldest?.at?.getTime() ?? Date.now());
  const to = arg("hasta") ? Date.parse(`${arg("hasta")}T00:00:00Z`) + DAY : Date.now();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new Error("--desde y --hasta deben ser fechas AAAA-MM-DD con --hasta después de --desde");

  console.log(`${parkings.length} sedes, ${new Date(from).toISOString()} a ${new Date(to).toISOString()}`);
  const started = Date.now();
  for (const [index, proyecto] of parkings.entries()) {
    for (let chunk = from; chunk < to; chunk += CHUNK) await totals.rebuild([proyecto], chunk, Math.min(to, chunk + CHUNK));
    console.log(`  ${index + 1}/${parkings.length} sedes · ${Math.round((Date.now() - started) / 1000)} s`);
  }
  await PostgresDatabase.disconnect();
};

main().catch((error) => { console.error(error); process.exit(1); });
