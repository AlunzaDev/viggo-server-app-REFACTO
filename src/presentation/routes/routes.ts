import { Router } from "express";

import { USER_APPS } from "../../domain/constants";

import { AuthMiddleware } from "../middlewares";

import { AuthRoutes } from "./auth/auth.routes";
import { PermissionProfileRoutes } from "./auth/permission-profile.routes";
import { UsuarioRoutes } from "./auth/usuario.routes";

import { InstallationsRoutes } from "./installations/installations.routes";
import { LocalProjectsRoutes } from "./local-projects/local-projects.routes";

import { ModuloRoutes } from "./parking/modulo.routes";
import { ProyectoRoutes } from "./parking/proyecto.routes";

import { PaymentRoutes } from "./payments/payment.routes";
import { StripePaymentRoutes } from "./payments/stripe-payment.routes";

import { PensionPassRoutes } from "./pension/pension-pass.routes";
import { PensionRoutes } from "./pension/pension.routes";

import { SyncRoutes } from "./sync/sync.routes";
import { MobileOperationRoutes } from "./mobile/mobile-operation.routes";
import { MobileOperationAdminRoutes } from "./mobile/mobile-operation-admin.routes";
import { StripeWebhookRoutes } from "./payments/stripe-webhook.routes";
import { HealthRoutes } from "./health/health.routes";
import { OperationalIncidentRoutes } from "./incidents/operational-incident.routes";

export class AppRoutes {
  static get routes(): Router {
    const router = Router();

    const requireAdminApp = AuthMiddleware.requireApps(USER_APPS.ADMIN_WEB);

    router.get("/api/ping", (_req, res) => {
      res.status(200).json({
        service: "viggo-administrativo",
        status: "ok",
        message: "pong",
      });
    });
    router.use("/api/health", HealthRoutes.routes);
    router.use("/api/auth", AuthRoutes.routes);
    router.use("/api/stripe/webhook", StripeWebhookRoutes.routes);
    router.use("/api/sync", SyncRoutes.routes);
    router.use(
      "/api/mobile",
      AuthMiddleware.requireAuth,
      AuthMiddleware.requireApps(USER_APPS.OPERATIVE_MOBILE),
      MobileOperationRoutes.routes,
    );
    router.use(
      "/api/mobile-operations",
      AuthMiddleware.requireAuth,
      requireAdminApp,
      MobileOperationAdminRoutes.routes,
    );
    router.use(
      "/api/operational-incidents",
      AuthMiddleware.requireAuth,
      requireAdminApp,
      OperationalIncidentRoutes.routes,
    );
    router.use(
      "/api/usuarios",
      AuthMiddleware.requireAuth,
      requireAdminApp,
      UsuarioRoutes.routes,
    );
    router.use(
      "/api/permission-profiles",
      AuthMiddleware.requireAuth,
      requireAdminApp,
      PermissionProfileRoutes.routes,
    );
    router.use(
      "/api/proyectos",
      AuthMiddleware.requireAuth,
      requireAdminApp,
      ProyectoRoutes.routes,
    );
    router.use(
      "/api/modulos",
      AuthMiddleware.requireAuth,
      requireAdminApp,
      ModuloRoutes.routes,
    );
    router.use(
      "/api/pensiones",
      AuthMiddleware.requireAuth,
      requireAdminApp,
      PensionRoutes.routes,
    );
    router.use(
      "/api/pension-pass",
      AuthMiddleware.requireAuth,
      requireAdminApp,
      PensionPassRoutes.routes,
    );
    router.use(
      "/api/payments",
      AuthMiddleware.requireAuth,
      requireAdminApp,
      PaymentRoutes.routes,
    );
    router.use(
      "/api/stripe",
      AuthMiddleware.requireAuth,
      requireAdminApp,
      StripePaymentRoutes.routes,
    );
    router.use(
      "/api/installations",
      AuthMiddleware.requireAuth,
      requireAdminApp,
      InstallationsRoutes.routes,
    );
    router.use(
      "/api/local-projects",
      AuthMiddleware.requireAuth,
      requireAdminApp,
      LocalProjectsRoutes.routes,
    );
    return router;
  }
}
