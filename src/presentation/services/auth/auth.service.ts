import { bcryptPlugin } from "../../../config/plugins/bcrypt.plugin";
import { JwtPlugin } from "../../../config/plugins/jwt.plugin";
import {
  resetPasswordEmailHtml,
  resetPasswordExpiredHtml,
  resetPasswordPageHtml,
} from "../../../config";
import { UsuarioEntity } from "../../../domain/entities/auth/usuario.entity";
import { CustomError } from "../../../domain/errors/custom.error";
import { AuthRepository } from "../../../domain/repository/auth/auth.repository";
import crypto from "crypto";
import { ForgotPasswordDto, ResetPasswordDto } from "../../../domain/dtos";
import { EmailService } from "../email/email.service";

const PASSWORD_RESET_WINDOW_MS = 30 * 60 * 1000;
const PASSWORD_RESET_RESPONSE_MESSAGE =
  "Si el correo existe y esta habilitado, enviaremos un enlace para restablecer la contrasena.";

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly emailService: EmailService,
    private readonly webServiceUrl: string,
  ) {}

  async registerUser(
    user: Omit<UsuarioEntity, "id">,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const userByCorreo = await this.authRepository.findByCorreo(user.correo);
    if (userByCorreo) {
      throw CustomError.badRequest("El correo ya esta registrado");
    }

    const userByTelefono = await this.authRepository.findByTelefono(
      user.telefono,
    );
    if (userByTelefono) {
      throw CustomError.badRequest("El telefono ya esta registrado");
    }

    const hashedPassword = bcryptPlugin.hash(user.password);

    const usuario = await this.authRepository.register({
      ...user,
      password: hashedPassword,
    });

    const token = await JwtPlugin.generateToken({ id: usuario.id });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    const { password, ...safeUsuario } = usuario;

    return {
      token,
      usuario: safeUsuario,
    };
  }

  async loginCorreo(
    correo: string,
    password: string,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const usuario = await this.authRepository.findByCorreo(correo);

    if (!usuario) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    if (!usuario.estado) {
      throw CustomError.forbidden("Usuario inactivo");
    }

    const validPassword = bcryptPlugin.compare(password, usuario.password);

    if (!validPassword) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    const token = await JwtPlugin.generateToken({ id: usuario.id });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    const { password: _, ...safeUsuario } = usuario;

    return {
      token,
      usuario: safeUsuario,
    };
  }

  async loginTelefono(
    telefono: string,
    password: string,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const usuario = await this.authRepository.findByTelefono(telefono);

    if (!usuario) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    if (!usuario.estado) {
      throw CustomError.forbidden("Usuario inactivo");
    }

    const validPassword = bcryptPlugin.compare(password, usuario.password);

    if (!validPassword) {
      throw CustomError.unauthorized("Credenciales incorrectas");
    }

    const token = await JwtPlugin.generateToken({ id: usuario.id });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    const { password: _, ...safeUsuario } = usuario;

    return {
      token,
      usuario: safeUsuario,
    };
  }

  async renewToken(
    id: string,
  ): Promise<{ token: unknown; usuario: Omit<UsuarioEntity, "password"> }> {
    const usuario = await this.authRepository.findById(id);

    if (!usuario) {
      throw CustomError.unauthorized("Usuario no encontrado");
    }

    if (!usuario.estado) {
      throw CustomError.forbidden("Usuario inactivo");
    }

    const token = await JwtPlugin.generateToken({ id: usuario.id });

    if (!token) {
      throw CustomError.internalServer("No se pudo generar el token");
    }

    const { password, ...safeUsuario } = usuario;

    return {
      token,
      usuario: safeUsuario,
    };
  }

  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
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
    const link = `${baseUrl}/api/auth/reset-password/${rawToken}`;
    const html = resetPasswordEmailHtml(link, usuario.correo, usuario.nombre);

    const isSent = await this.emailService.sendEmail({
      to: usuario.correo,
      subject: "Recuperacion de contrasena",
      htmlBody: html,
    });

    if (!isSent) {
      throw CustomError.internalServer("Error Sending Email");
    }

    return {
      message: PASSWORD_RESET_RESPONSE_MESSAGE,
    };
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const tokenHash = this.hashResetToken(resetPasswordDto.token);

    const usuario =
      await this.authRepository.getUserByPasswordResetToken(tokenHash);

    if (!usuario) {
      throw CustomError.unauthorized(
        "El enlace de recuperacion es invalido o expiro",
      );
    }

    const passwordHash = bcryptPlugin.hash(resetPasswordDto.newPassword);

    await this.authRepository.resetPassword(usuario.id, passwordHash);

    return {
      message:
        "Tu contrasena se actualizo correctamente. Ya puedes iniciar sesion.",
    };
  }

  private hashResetToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

    async getResetPasswordPage(
    token: string,
  ): Promise<{ statusCode: number; html: string }> {
    if (!token) {
      return { statusCode: 400, html: resetPasswordExpiredHtml() };
    }

    const usuario = await this.authRepository.getUserByPasswordResetToken(
      this.hashResetToken(token),
    );

    if (!usuario) {
      return { statusCode: 400, html: resetPasswordExpiredHtml() };
    }

    const submitUrl = `${this.webServiceUrl.replace(/\/+$/, "")}/api/auth/reset-password`;

    return {
      statusCode: 200,
      html: resetPasswordPageHtml(token, submitUrl),
    };
  }
}
