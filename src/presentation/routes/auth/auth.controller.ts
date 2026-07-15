import { Request, Response } from "express";
import {
  ForgotPasswordDto,
  ResetPasswordDto,
} from "../../../domain/dtos";
import { LoginCorreoDto } from "../../../domain/dtos/auth/login-correo.dto";
import { LoginTelefonoDto } from "../../../domain/dtos/auth/login-telefono.dto";
import { RegisterUserDto } from "../../../domain/dtos/auth/register-user.dto";
import { ErrorService } from "../../services/error.service";
import { AuthService } from "../../services/auth/auth.service";

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  registerUser = async (req: Request, res: Response) => {
    try {
      const [error, registerUserDto] = RegisterUserDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const result = await this.authService.registerUser(registerUserDto!);
      return res.status(201).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  loginCorreo = async (req: Request, res: Response) => {
    try {
      const [error, loginCorreoDto] = LoginCorreoDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const result = await this.authService.loginCorreo(
        loginCorreoDto!.correo,
        loginCorreoDto!.password,
      );
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  loginTelefono = async (req: Request, res: Response) => {
    try {
      const [error, loginTelefonoDto] = LoginTelefonoDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const result = await this.authService.loginTelefono(
        loginTelefonoDto!.telefono,
        loginTelefonoDto!.password,
      );
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  forgotPassword = async (req: Request, res: Response) => {
    try {
      const [error, forgotPasswordDto] = ForgotPasswordDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const result = await this.authService.forgotPassword(forgotPasswordDto!);
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  resetPassword = async (req: Request, res: Response) => {
    try {
      const [error, resetPasswordDto] = ResetPasswordDto.create(req.body);
      if (error) return res.status(400).json({ error });

      const result = await this.authService.resetPassword(resetPasswordDto!);
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  renderResetPasswordPage = async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token ?? "").trim();
      const result = await this.authService.getResetPasswordPage(token);
      return res.status(result.statusCode).send(result.html);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  renewToken = async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const result = await this.authService.renewToken(id);
      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}
