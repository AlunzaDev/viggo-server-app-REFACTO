import { envs } from "../../config";
import { AuthMongoDatasource } from "../../infrastructure/datasources/auth/auth.datasource.mongo";
import { UsuarioMongoDatasource } from "../../infrastructure/datasources/auth/usuario.datasource.mongo";
import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth/auth.repository.impl";
import { UsuarioRepositoryImpl } from "../../infrastructure/repositories/auth/usuario.repository.impl";
import { AuthController } from "../routes/auth/auth.controller";
import { UsuarioController } from "../routes/auth/usuario.controller";
import { AuthService } from "../services/auth/auth.service";
import { UsuarioService } from "../services/auth/usuario.service";
import { EmailService } from "../services/email/email.service";

export const buildAuthController = (): AuthController => {
  const datasource = new AuthMongoDatasource();
  const repository = new AuthRepositoryImpl(datasource);
  const emailService = new EmailService();
  const service = new AuthService(
    repository,
    emailService,
    envs.WEB_SERVICE_URL,
  );

  return new AuthController(service);
};

export const buildUsuarioController = (): UsuarioController => {
  const datasource = new UsuarioMongoDatasource();
  const repository = new UsuarioRepositoryImpl(datasource);
  const service = new UsuarioService(repository);

  return new UsuarioController(service);
};
