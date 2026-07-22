import { Router } from "express";
import { MongoDatabase } from "../../data/mongo";
import { AuthRoutes } from "./auth/auth.routes";
import { UsuarioRoutes } from "./auth/usuario.routes";
import { ProveedorRoutes } from "./proveedores/proveedor.routes";
import { ProyectoRoutes } from "./parking/proyecto.routes";
import { ModuloRoutes } from "./parking/modulo.routes";
import { TicketRoutes } from "./parking/ticket.routes";
import { PensionRoutes } from "./pension/pension.routes";
import { PensionPassRoutes } from "./pension/pension-pass.routes";
import { PensionMoveRoutes } from "./pension/pension-move.routes";
import { CashRegisterRoutes } from "./cash-register/cash-register.routes";
import { TicketPaymentRoutes } from "./payments/ticket-payment.routes";
import { StripePaymentRoutes } from "./payments/stripe-payment.routes";
import { CashTicketPaymentRoutes } from "./payments/cash-ticket-payment.routes";

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

    router.use("/api/auth", AuthRoutes.routes);
    router.use("/api/usuarios", UsuarioRoutes.routes);

    router.use("/api/proveedores", ProveedorRoutes.routes);
    router.use("/api/proyectos", ProyectoRoutes.routes);
    router.use("/api/modulos", ModuloRoutes.routes);
    router.use("/api/tickets", TicketRoutes.routes);
    router.use("/api/pensiones", PensionRoutes.routes);
    router.use("/api/pension-pass", PensionPassRoutes.routes);
    router.use("/api/pension-moves", PensionMoveRoutes.routes);
    router.use("/api/pos-register", CashRegisterRoutes.routes);
    router.use("/api/cash-register", CashRegisterRoutes.routes);
    router.use("/api/payments", TicketPaymentRoutes.routes);
    router.use("/api/stripe", StripePaymentRoutes.routes);
    router.use("/api/pos-payments", CashTicketPaymentRoutes.routes);
    router.use("/api/cash-payments", CashTicketPaymentRoutes.routes);

    return router;
  }
}
