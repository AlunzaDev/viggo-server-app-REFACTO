import { Prisma } from "../../../generated/prisma/client";
import { countOutput, groupKey, inRange, scope, type MetricContext, type MetricQuery } from "../statistics-sql";

/** Passes with a user, active and valid at `now`; optionally ending within `days`. */
const validPasses = async (ctx: MetricContext, days: number | null) => {
  const now = new Date(ctx.now);
  const rows = await ctx.db.$queryRaw<Array<{ clave: string; valor: number }>>(Prisma.sql`
    WITH ${scope(ctx.query.proyectos, ctx.query.rango)}
    SELECT ${ctx.query.agrupar === "proyecto" ? Prisma.sql`s.proyecto_id::text` : Prisma.sql`'total'`} AS clave, count(*)::int AS valor
    FROM pension_passes pp JOIN pensiones pe ON pe.id = pp.pension_id JOIN scope s ON s.proyecto_id = pe.proyecto_id
    WHERE pp.estado AND pp.vigent AND pp.usuario_id IS NOT NULL
      AND pp.valid_from <= ${now} AND pp.valid_to > ${now}
      ${days === null ? Prisma.empty : Prisma.sql`AND pp.valid_to <= ${new Date(ctx.now + days * 86_400_000)}`}
    GROUP BY 1 ORDER BY 1`);
  return countOutput(rows, ctx.query.agrupar !== null);
};

/** Contact within 15 s is online, within 60 s intermittent; never linked is unlinked. */
const ONLINE_MS = 15_000;
const WARNING_MS = 60_000;

export const pensionAndOperationMetrics: Record<string, MetricQuery> = {
  "pensiones.vigentes": (ctx) => validPasses(ctx, null),
  "pensiones.por_vencer": (ctx) => validPasses(ctx, 7),

  async "pensiones.movimientos"(ctx) {
    const rows = await ctx.db.$queryRaw<Array<{ clave: string; valor: number }>>(Prisma.sql`
      WITH ${scope(ctx.query.proyectos, ctx.query.rango)}
      SELECT ${groupKey(ctx.query.agrupar, Prisma.sql`m.fecha`, { tipo: Prisma.sql`m.payload->>'tipo'` })} AS clave, count(*)::int AS valor
      FROM operational_pension_moves m JOIN scope s ON s.proyecto_id = m.proyecto_id
      WHERE ${inRange(Prisma.sql`m.fecha`)} GROUP BY 1 ORDER BY 1`);
    return countOutput(rows, ctx.query.agrupar !== null);
  },

  async "operacion.conectividad"(ctx) {
    const rows = await ctx.db.$queryRaw<Array<{ proyecto_id: string; nombre: string; ciudad: string; instalaciones: number; ultimo: Date | null;
      dispositivos: number; dispositivos_activos: number }>>(Prisma.sql`
      WITH ${scope(ctx.query.proyectos, ctx.query.rango)}
      SELECT s.proyecto_id::text, p.nombre, p.ciudad,
        (SELECT count(*)::int FROM local_installations i WHERE i.proyecto_id = s.proyecto_id AND i.status = 'approved') AS instalaciones,
        GREATEST(
          (SELECT max(i.last_command_poll_at) FROM local_installations i WHERE i.proyecto_id = s.proyecto_id AND i.status = 'approved'),
          (SELECT LEAST(h.generated_at, h.received_at) FROM project_heartbeat_snapshots h WHERE h.proyecto_id = s.proyecto_id)
        ) AS ultimo,
        (SELECT count(*)::int FROM modulos m WHERE m.proyecto_id = s.proyecto_id) AS dispositivos,
        (SELECT count(*)::int FROM modulos m JOIN modulo_device_states d ON d.modulo_id = m.id
          WHERE m.proyecto_id = s.proyecto_id AND d.is_connected AND d.is_authorized AND d.last_heartbeat_at > ${new Date(ctx.now - WARNING_MS)}) AS dispositivos_activos
      FROM scope s JOIN proyectos p ON p.id = s.proyecto_id ORDER BY p.nombre`);
    return {
      estado: "ok",
      valor: rows.map((row) => {
        const age = row.ultimo ? ctx.now - row.ultimo.getTime() : Infinity;
        const estado = !row.instalaciones ? "sin_vincular" : age <= ONLINE_MS ? "en_linea" : age <= WARNING_MS ? "intermitente" : "desconectada";
        return {
          proyectoId: row.proyecto_id, nombre: row.nombre, ciudad: row.ciudad, estado, ultimoContacto: row.ultimo?.getTime() ?? null,
          dispositivos: row.dispositivos, dispositivosActivos: estado === "en_linea" ? row.dispositivos_activos : 0,
        };
      }),
    };
  },
};
