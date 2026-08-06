import crypto from "crypto";

import {
  emailValidationHTML,
  resetPasswordEmailHtml,
  resetPasswordExpiredHtml,
  resetPasswordPageHtml,
} from "../../../config";

import { bcryptPlugin } from "../../../config/plugins/bcrypt.plugin";
import { JwtPlugin } from "../../../config/plugins/jwt.plugin";

import { USER_APPS, type UserAppAccess } from "../../../domain/constants";

import {
  ForgotPasswordDto,
  RegisterUserDto,
  ResendValidationEmailDto,
  ResetPasswordDto,
} from "../../../domain/dtos";

import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { AuthRepository } from "../../../domain/repository/auth/auth.repository";

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
  USER_APPS.OPERATIVE_WEB,
  USER_APPS.OPERATIVE_MOBILE,
];

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly emailService: EmailService,
    private readonly webServiceUrl: string,
  ) {}

  async registerUser(user: RegisterUserDto): Promise<{
    message: string;
    usuario: Omit<UsuarioEntity, "password">;
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

      // El servidor asigna las aplicaciones del autorregistro.
      allowedApps: DEFAULT_REGISTER_ALLOWED_APPS,

      emailValidated: false,
      password: hashedPassword,
    });

    await this.sendEmailValidationLink(usuario.id, usuario.correo);

    const { password, ...safeUsuario } = usuario;

    return {
      message: REGISTER_RESPONSE_MESSAGE,
      usuario: safeUsuario,
    };
  }

  /**
   * Inicio de sesión mediante correo.
   */
  async loginCorreo(
    correo: string,
    password: string,
    app: UserAppAccess,
  ): Promise<{
    token: unknown;
    usuario: Omit<UsuarioEntity, "password">;
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

    const token = await JwtPlugin.generateToken({
      id: usuario.id,
      app,
    });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    const { password: _, ...safeUsuario } = usuario;

    return {
      token,
      usuario: safeUsuario,
    };
  }

  /**
   * Inicio de sesión mediante teléfono.
   */
  async loginTelefono(
    telefono: string,
    password: string,
    app: UserAppAccess,
  ): Promise<{
    token: unknown;
    usuario: Omit<UsuarioEntity, "password">;
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

    const token = await JwtPlugin.generateToken({
      id: usuario.id,
      app,
    });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    const { password: _, ...safeUsuario } = usuario;

    return {
      token,
      usuario: safeUsuario,
    };
  }

  /**
   * Renueva el token utilizando el usuario y la aplicación incluidos
   * en el token anterior.
   */
  async renewToken(
    id: string,
    app: UserAppAccess,
  ): Promise<{
    token: unknown;
    usuario: Omit<UsuarioEntity, "password">;
  }> {
    const usuario = await this.authRepository.findById(id);

    if (!usuario) {
      throw CustomError.unauthorized("Usuario no encontrado");
    }

    this.validateUserStatus(usuario);
    this.validateApplicationAccess(usuario, app);

    const token = await JwtPlugin.generateToken({
      id: usuario.id,
      app,
    });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    const { password, ...safeUsuario } = usuario;

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

    /*
     * No revelamos si el correo existe para evitar enumeración
     * de cuentas.
     */
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

    /*
     * Se devuelve siempre el mismo mensaje para no revelar
     * información sobre la existencia de la cuenta.
     */
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

  /**
   * Verifica que la cuenta se encuentre activa y validada.
   */
  private validateUserStatus(usuario: UsuarioEntity): void {
    if (!usuario.estado) {
      throw CustomError.forbidden("Usuario inactivo");
    }

    if (!usuario.emailValidated) {
      throw CustomError.forbidden("Debes validar tu correo primero");
    }
  }

  /**
   * Verifica que el usuario tenga acceso a la aplicación
   * desde la que intenta iniciar sesión o renovar el token.
   */
  private validateApplicationAccess(
    usuario: UsuarioEntity,
    app: UserAppAccess,
  ): void {
    if (!usuario.allowedApps.includes(app)) {
      throw CustomError.forbidden("No tienes acceso a esta aplicación");
    }
  }

  private hashResetToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private hashEmailValidationToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
