import { envs } from "../../config";
import { AuthController } from "../routes/auth/auth.controller";
import { PermissionProfileController } from "../routes/auth/permission-profile.controller";
import { UsuarioController } from "../routes/auth/usuario.controller";
import { AuthService } from "../services/auth/auth.service";
import { PermissionProfileService } from "../services/auth/permission-profile.service";
import { UsuarioService } from "../services/auth/usuario.service";
import { EmailService } from "../services/email/email.service";
import {
  buildAuthRepository,
  buildPermissionProfileRepository,
  buildUsuarioRepository,
} from "./repositories.dependencies";

const buildAuthService = () =>
  new AuthService(
    buildAuthRepository(),
    new EmailService(),
    envs.WEB_SERVICE_URL,
    buildPermissionProfileRepository(),
  );

export const buildAuthController = (): AuthController =>
  new AuthController(buildAuthService());

export const buildUsuarioController = (): UsuarioController =>
  new UsuarioController(
    new UsuarioService(buildUsuarioRepository(), buildPermissionProfileRepository(), buildAuthService()),
  );

export const buildPermissionProfileController = (): PermissionProfileController =>
  new PermissionProfileController(
    new PermissionProfileService(buildPermissionProfileRepository(), buildUsuarioRepository()),
  );
