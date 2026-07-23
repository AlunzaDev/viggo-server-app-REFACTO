import { Router } from "express";
import { MongoDatabase } from "../../data/mongo";
import { AuthRoutes } from "./auth/auth.routes";
import { PermissionProfileRoutes } from "./auth/permission-profile.routes";
import { UsuarioRoutes } from "./auth/usuario.routes";
import { ModuloRoutes } from "./parking/modulo.routes";
import { ProyectoRoutes } from "./parking/proyecto.routes";
import { PaymentRoutes } from "./payments/payment.routes";
import { StripePaymentRoutes } from "./payments/stripe-payment.routes";
import { PensionPassRoutes } from "./pension/pension-pass.routes";
import { PensionRoutes } from "./pension/pension.routes";
import { SyncRoutes } from "./sync/sync.routes";

export class AppRoutes {
  static get routes(): Router {
    const router = Router();

    router.get("/api/ping", (_req, res) => {
      res.status(200).json({ service: "viggo-nubeadmin", status: "ok", message: "pong" });
    });

    router.get("/api/health", (_req, res) => {
      const health = MongoDatabase.getHealthSnapshot();
      res.status(health.status === "ok" ? 200 : 503).json({
        service: "viggo-nubeadmin",
        ...health,
      });
    });

    router.use("/api/auth", AuthRoutes.routes);
    router.use("/api/usuarios", UsuarioRoutes.routes);
    router.use("/api/permission-profiles", PermissionProfileRoutes.routes);
    router.use("/api/proyectos", ProyectoRoutes.routes);
    router.use("/api/modulos", ModuloRoutes.routes);
    router.use("/api/pensiones", PensionRoutes.routes);
    router.use("/api/pension-pass", PensionPassRoutes.routes);
    router.use("/api/payments", PaymentRoutes.routes);
    router.use("/api/stripe", StripePaymentRoutes.routes);
    router.use("/api/sync", SyncRoutes.routes);

    return router;
  }
}
