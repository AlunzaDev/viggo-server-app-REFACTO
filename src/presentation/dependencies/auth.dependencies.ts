import { envs } from "../../config";
import { AuthMongoDatasource } from "../../infrastructure/datasources/auth/auth.datasource.mongo";
import { PermissionProfileMongoDatasource } from "../../infrastructure/datasources/auth/permission-profile.datasource.mongo";
import { UsuarioMongoDatasource } from "../../infrastructure/datasources/auth/usuario.datasource.mongo";
import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth/auth.repository.impl";
import { PermissionProfileRepositoryImpl } from "../../infrastructure/repositories/auth/permission-profile.repository.impl";
import { UsuarioRepositoryImpl } from "../../infrastructure/repositories/auth/usuario.repository.impl";
import { AuthController } from "../routes/auth/auth.controller";
import { PermissionProfileController } from "../routes/auth/permission-profile.controller";
import { UsuarioController } from "../routes/auth/usuario.controller";
import { AuthService } from "../services/auth/auth.service";
import { PermissionProfileService } from "../services/auth/permission-profile.service";
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
  const usuarioDatasource = new UsuarioMongoDatasource();
  const repository = new UsuarioRepositoryImpl(usuarioDatasource);
  const permissionProfileDatasource = new PermissionProfileMongoDatasource();
  const permissionProfileRepository = new PermissionProfileRepositoryImpl(
    permissionProfileDatasource,
  );
  const authDatasource = new AuthMongoDatasource();
  const authRepository = new AuthRepositoryImpl(authDatasource);
  const emailService = new EmailService();
  const authService = new AuthService(
    authRepository,
    emailService,
    envs.WEB_SERVICE_URL,
  );
  const service = new UsuarioService(
    repository,
    permissionProfileRepository,
    authService,
  );

  return new UsuarioController(service);
};

export const buildPermissionProfileController =
  (): PermissionProfileController => {
    const datasource = new PermissionProfileMongoDatasource();
    const repository = new PermissionProfileRepositoryImpl(datasource);
    const usuarioDatasource = new UsuarioMongoDatasource();
    const usuarioRepository = new UsuarioRepositoryImpl(usuarioDatasource);
    const service = new PermissionProfileService(repository, usuarioRepository);

    return new PermissionProfileController(service);
  };
