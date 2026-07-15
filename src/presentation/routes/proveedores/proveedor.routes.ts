import { Router } from "express";
import { buildProveedorController } from "../../dependencies";

export class ProveedorRoutes {
  static get routes(): Router {
    const router = Router();

    const controller = buildProveedorController();

    router.post("/", controller.createProveedor);

    return router;
  }
}
