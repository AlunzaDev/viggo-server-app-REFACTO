import { Router } from "express";
import { MongoDatabase } from "../../data/mongo";
import { ProveedorRoutes } from "./proveedores/proveedor.routes";

export class AppRoutes {
  static get routes(): Router {
    const router = Router();

    router.get("/api/ping", (_req, res) => {
      res.status(200).json({ status: "ok", message: "pong" });
    });

    router.get("/api/health", (_req, res) => {
      const health = MongoDatabase.getHealthSnapshot();
      res.status(health.status === "ok" ? 200 : 503).json(health);
    });

    router.use("/api/proveedores", ProveedorRoutes.routes);

    return router;
  }
}
