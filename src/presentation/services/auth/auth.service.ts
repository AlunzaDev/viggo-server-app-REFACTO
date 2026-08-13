import crypto from "crypto";

import {
  emailValidationHTML,
  resetPasswordEmailHtml,
  resetPasswordExpiredHtml,
  resetPasswordPageHtml,
} from "../../../config";
import { bcryptPlugin } from "../../../config/plugins/bcrypt.plugin";
import { JwtPlugin } from "../../../config/plugins/jwt.plugin";

import {
  isRoleAllowedForApp,
  USER_APPS,
  type UserAppAccess,
} from "../../../domain/constants";
import {
  ForgotPasswordDto,
  RegisterUserDto,
  ResendValidationEmailDto,
  ResetPasswordDto,
} from "../../../domain/dtos";
import {
  UsuarioEntity,
  type UserAppPermission,
} from "../../../domain/entities/auth/usuario.entity";
import type { PermissionProfileEntity } from "../../../domain/entities/auth/permission-profile.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { AuthRepository } from "../../../domain/repositories/auth/auth.repository";
import { PermissionProfileRepository } from "../../../domain/repositories/auth/permission-profile.repository";

import { EmailService } from "../email/email.service";

const PASSWORD_RESET_WINDOW_MS = 30 * 60 * 1000;
const EMAIL_VALIDATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const PASSWORD_RESET_RESPONSE_MESSAGE =
  "Si el correo existe y está habilitado, enviaremos un enlace para restablecer la contraseña.";

const EMAIL_VALIDATION_RESPONSE_MESSAGE =
  "Si el correo existe y está pendiente de validación, enviaremos un enlace para validar la cuenta.";

const REGISTER_RESPONSE_MESSAGE =
  "Cuenta creada correctamente. Te enviamos un enlace para validar tu correo antes de iniciar sesión.";

const DEFAULT_REGISTER_ALLOWED_APPS: UserAppAccess[] = [
  USER_APPS.OPERATIVE_MOBILE,
];

type SafeUsuario = Omit<UsuarioEntity, "password">;

type ResolvedApplicationAccess = {
  permissionProfileId?: string;
  modules: PermissionProfileEntity["modules"];
  appPermissions: UserAppPermission[];
};

type SessionUsuario = SafeUsuario & ResolvedApplicationAccess;

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly emailService: EmailService,
    private readonly webServiceUrl: string,
    private readonly permissionProfileRepository: PermissionProfileRepository,
  ) {}

  async registerUser(user: RegisterUserDto): Promise<{
    message: string;
    usuario: SafeUsuario;
  }> {
    const userByCorreo = await this.authRepository.findByCorreo(user.correo);

    if (userByCorreo) {
      throw CustomError.badRequest("El correo ya está registrado");
    }

    const userByTelefono = await this.authRepository.findByTelefono(
      user.telefono,
    );

    if (userByTelefono) {
      throw CustomError.badRequest("El teléfono ya está registrado");
    }

    const hashedPassword = bcryptPlugin.hash(user.password);

    const usuario = await this.authRepository.register({
      ...user,
      allowedApps: DEFAULT_REGISTER_ALLOWED_APPS,
      appPermissions: [],
      emailValidated: false,
      password: hashedPassword,
    });

    await this.sendEmailValidationLink(usuario.id, usuario.correo);

    return {
      message: REGISTER_RESPONSE_MESSAGE,
      usuario: this.toSafeUsuario(usuario),
    };
  }

  async loginCorreo(
    correo: string,
    password: string,
    app: UserAppAccess,
  ): Promise<{
    token: unknown;
    usuario: SessionUsuario;
  }> {
    const usuario = await this.authRepository.findByCorreo(correo);

    if (!usuario) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    const validPassword = bcryptPlugin.compare(password, usuario.password);

    if (!validPassword) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    this.validateUserStatus(usuario);
    this.validateApplicationAccess(usuario, app);

    const safeUsuario = await this.resolveApplicationUser(usuario, app);

    const token = await JwtPlugin.generateToken({
      id: usuario.id,
      app,
    });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    return {
      token,
      usuario: safeUsuario,
    };
  }

  async loginTelefono(
    telefono: string,
    password: string,
    app: UserAppAccess,
  ): Promise<{
    token: unknown;
    usuario: SessionUsuario;
  }> {
    const usuario = await this.authRepository.findByTelefono(telefono);

    if (!usuario) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    const validPassword = bcryptPlugin.compare(password, usuario.password);

    if (!validPassword) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    this.validateUserStatus(usuario);
    this.validateApplicationAccess(usuario, app);

    const safeUsuario = await this.resolveApplicationUser(usuario, app);

    const token = await JwtPlugin.generateToken({
      id: usuario.id,
      app,
    });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    return {
      token,
      usuario: safeUsuario,
    };
  }

  async renewToken(
    id: string,
    app: UserAppAccess,
  ): Promise<{
    token: unknown;
    usuario: SafeUsuario;
  }> {
    const usuario = await this.authRepository.findById(id);

    if (!usuario) {
      throw CustomError.unauthorized("Usuario no encontrado");
    }

    this.validateUserStatus(usuario);
    this.validateApplicationAccess(usuario, app);

    const safeUsuario = await this.resolveApplicationUser(usuario, app);

    const token = await JwtPlugin.generateToken({
      id: usuario.id,
      app,
    });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    return {
      token,
      usuario: safeUsuario,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<{
    message: string;
  }> {
    const usuario = await this.authRepository.findByCorreo(
      forgotPasswordDto.correo,
    );

    if (!usuario || !usuario.estado) {
      return {
        message: PASSWORD_RESET_RESPONSE_MESSAGE,
      };
    }

    const rawToken = crypto.randomBytes(32).toString("hex");

    const tokenHash = this.hashResetToken(rawToken);

    const expiresAt = new Date(Date.now() + PASSWORD_RESET_WINDOW_MS);

    await this.authRepository.savePasswordResetToken(
      usuario.id,
      tokenHash,
      expiresAt,
    );

    const baseUrl = this.webServiceUrl.replace(/\/+$/, "");

    const link = `${baseUrl}/reset-password/${rawToken}`;

    const html = resetPasswordEmailHtml(link, usuario.correo, usuario.nombre);

    const isSent = await this.emailService.sendEmail({
      to: usuario.correo,
      subject: "Recuperación de contraseña",
      htmlBody: html,
    });

    if (!isSent) {
      throw CustomError.internalServer("No se pudo enviar el correo");
    }

    return {
      message: PASSWORD_RESET_RESPONSE_MESSAGE,
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{
    message: string;
  }> {
    const tokenHash = this.hashResetToken(resetPasswordDto.token);

    const usuario =
      await this.authRepository.getUserByPasswordResetToken(tokenHash);

    if (!usuario) {
      throw CustomError.unauthorized(
        "El enlace de recuperación es inválido o expiró",
      );
    }

    const passwordHash = bcryptPlugin.hash(resetPasswordDto.newPassword);

    await this.authRepository.resetPassword(usuario.id, passwordHash);

    return {
      message:
        "Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión.",
    };
  }

  async getResetPasswordPage(token: string): Promise<{
    statusCode: number;
    html: string;
  }> {
    if (!token) {
      return {
        statusCode: 400,
        html: resetPasswordExpiredHtml(),
      };
    }

    const usuario = await this.authRepository.getUserByPasswordResetToken(
      this.hashResetToken(token),
    );

    if (!usuario) {
      return {
        statusCode: 400,
        html: resetPasswordExpiredHtml(),
      };
    }

    const submitUrl =
      `${this.webServiceUrl.replace(/\/+$/, "")}` + "/api/auth/reset-password";

    return {
      statusCode: 200,
      html: resetPasswordPageHtml(token, submitUrl),
    };
  }

  async sendEmailValidationLink(
    userId: string,
    correo: string,
  ): Promise<boolean> {
    const rawToken = crypto.randomBytes(32).toString("hex");

    const tokenHash = this.hashEmailValidationToken(rawToken);

    const expiresAt = new Date(Date.now() + EMAIL_VALIDATION_WINDOW_MS);

    await this.authRepository.saveEmailValidationToken(
      userId,
      tokenHash,
      expiresAt,
    );

    const baseUrl = this.webServiceUrl.replace(/\/+$/, "");

    const link = `${baseUrl}/api/auth/validate-email/${rawToken}`;

    const html = emailValidationHTML(link, correo);

    const isSent = await this.emailService.sendEmail({
      to: correo,
      subject: "Valida tu correo",
      htmlBody: html,
    });

    if (!isSent) {
      throw CustomError.internalServer("No se pudo enviar el correo");
    }

    return true;
  }

  async validateEmail(token: string): Promise<UsuarioEntity> {
    const tokenHash = this.hashEmailValidationToken(token);

    const usuario =
      await this.authRepository.getUserByEmailValidationToken(tokenHash);

    if (!usuario) {
      throw CustomError.unauthorized("Token inválido, expirado o ya utilizado");
    }

    return this.authRepository.consumeEmailValidationToken(usuario.id);
  }

  async resendValidationEmail(
    resendValidationEmailDto: ResendValidationEmailDto,
  ): Promise<{
    message: string;
  }> {
    const usuario = await this.authRepository.findByCorreo(
      resendValidationEmailDto.correo,
    );

    if (!usuario || !usuario.estado || usuario.emailValidated) {
      return {
        message: EMAIL_VALIDATION_RESPONSE_MESSAGE,
      };
    }

    await this.sendEmailValidationLink(usuario.id, usuario.correo);

    return {
      message: EMAIL_VALIDATION_RESPONSE_MESSAGE,
    };
  }

  private validateUserStatus(usuario: UsuarioEntity): void {
    if (!usuario.estado) {
      throw CustomError.forbidden("Usuario inactivo");
    }

    if (!usuario.emailValidated) {
      throw CustomError.forbidden("Debes validar tu correo primero");
    }
  }

  private validateApplicationAccess(
    usuario: UsuarioEntity,
    app: UserAppAccess,
  ): void {
    if (!usuario.allowedApps.includes(app)) {
      throw CustomError.forbidden("No tienes acceso a esta aplicación");
    }
    if (!isRoleAllowedForApp(usuario.rol, app)) {
      throw CustomError.forbidden("Tu rol no permite acceder a esta aplicación");
    }
  }

  private async resolveApplicationUser(
    usuario: UsuarioEntity,
    app: UserAppAccess,
  ): Promise<SessionUsuario> {
    const resolvedAccess = await this.resolveApplicationPermissions(
      usuario,
      app,
    );

    const safeUsuario = this.toSafeUsuario(usuario);

    return {
      ...safeUsuario,
      ...resolvedAccess,
    };
  }

  private async resolveApplicationPermissions(
    usuario: UsuarioEntity,
    app: UserAppAccess,
  ): Promise<ResolvedApplicationAccess> {
    const assignment = usuario.appPermissions.find(
      (permission) => permission.app === app,
    );

    if (assignment) {
      return this.resolveAssignedProfile(assignment, app);
    }

    if (app === USER_APPS.OPERATIVE_MOBILE) {
      return {
        permissionProfileId: undefined,
        modules: [],
        appPermissions: [],
      };
    }

    throw CustomError.forbidden(
      "No tienes un perfil de permisos asignado para esta aplicación",
    );
  }

  private async resolveAssignedProfile(
    assignment: UserAppPermission,
    app: UserAppAccess,
  ): Promise<ResolvedApplicationAccess> {
    const profile = await this.permissionProfileRepository.findById(
      assignment.permissionProfileId,
    );

    if (!profile || !profile.estado) {
      throw CustomError.forbidden(
        "El perfil de permisos asignado no existe o está inactivo",
      );
    }

    if (profile.app !== app) {
      throw CustomError.forbidden(
        "El perfil de permisos no pertenece a esta aplicación",
      );
    }

    return {
      permissionProfileId: profile.id,
      modules: [...profile.modules],
      appPermissions: [
        {
          app,
          permissionProfileId: profile.id,
        },
      ],
    };
  }

  private toSafeUsuario(usuario: UsuarioEntity): SafeUsuario {
    const { password, ...safeUsuario } = usuario;

    return safeUsuario;
  }

  private hashResetToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private hashEmailValidationToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
