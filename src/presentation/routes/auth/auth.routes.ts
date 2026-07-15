import { Router } from "express";
import { envs } from "../../../config";
import { AuthMongoDatasource } from "../../../infrastructure/datasources/auth/auth.datasource.mongo";
import { AuthRepositoryImpl } from "../../../infrastructure/repositories/auth/auth.repository.impl";
import { AuthController } from "./auth.controller";
import { AuthService } from "../../services/auth/auth.service";
import { EmailService } from "../../services/email/email.service";

export class AuthRoutes {
  static get routes(): Router {
    const router = Router();

    const datasource = new AuthMongoDatasource();
    const repository = new AuthRepositoryImpl(datasource);
    const emailService = new EmailService();
    const service = new AuthService(
      repository,
      emailService,
      envs.WEB_SERVICE_URL,
    );
    const controller = new AuthController(service);

    router.post("/register-user", controller.registerUser);
    router.post("/login-correo", controller.loginCorreo);
    router.post("/login-telefono", controller.loginTelefono);
    router.post("/forgot-password", controller.forgotPassword);
    router.get("/reset-password/:token", controller.renderResetPasswordPage);
    router.post("/reset-password", controller.resetPassword);
    router.get("/renew/:id", controller.renewToken);

    return router;
  }
}
