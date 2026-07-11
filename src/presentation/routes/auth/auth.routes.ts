import { Router } from "express";
import { AuthMongoDatasource } from "../../../infrastructure/datasources/auth/auth.datasource.mongo";
import { AuthRepositoryImpl } from "../../../infrastructure/repositories/auth/auth.repository.impl";
import { AuthController } from "./auth.controller";
import { AuthService } from "../../services/auth/auth.service";

export class AuthRoutes {
  static get routes(): Router {
    const router = Router();

    const datasource = new AuthMongoDatasource();
    const repository = new AuthRepositoryImpl(datasource);
    const service = new AuthService(repository);
    const controller = new AuthController(service);

    router.post("/register-user", controller.registerUser);
    router.post("/login-correo", controller.loginCorreo);
    router.post("/login-telefono", controller.loginTelefono);
    router.get("/renew/:id", controller.renewToken);

    return router;
  }
}
