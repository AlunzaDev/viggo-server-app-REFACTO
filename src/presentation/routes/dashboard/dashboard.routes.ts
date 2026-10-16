import { Router } from "express";
import { DashboardPostgresDatasource } from "../../../infrastructure/datasources/dashboard/dashboard.datasource.postgres";
import { PostgresDatabase } from "../../../data/postgres";
import { isUuid } from "../../../infrastructure/datasources/postgres/prisma-errors";
import { AuthMiddleware, getAllowedProjectIdsFromRequest, isSuperAdminRequest } from "../../middlewares";
import { ErrorService } from "../../services/error.service";

export class DashboardRoutes {
  static get routes() {
    const router = Router();
    router.get("/", AuthMiddleware.requireModules("payments"), async (req,res) => {
      try {
        const from = Number(req.query.from), to = Number(req.query.to);
        if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to-from > 366*86_400_000 || !Number.isFinite(new Date(to).getTime())) {
          return res.status(400).json({error:"Selecciona un período válido de hasta 366 días"});
        }
        const selected = String(req.query.projectId ?? "all");
        if (selected !== "all" && !isUuid(selected)) return res.status(400).json({error:"Proyecto inválido"});
        const allowed = getAllowedProjectIdsFromRequest(req);
        if (selected !== "all" && !isSuperAdminRequest(req) && !allowed.includes(selected)) return res.status(403).json({error:"Forbidden"});
        const projects = await PostgresDatabase.client.proyecto.findMany({where:{
          ...(isSuperAdminRequest(req) ? {} : { id:{in:allowed} }),
          ...(selected !== "all" ? {id:selected} : {}),
        },select:{id:true}});
        return res.json(await new DashboardPostgresDatasource().getMetrics(projects.map(p=>p.id),from,to));
      } catch(error) { return ErrorService.handleApiError(error,res); }
    });
    return router;
  }
}
