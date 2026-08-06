import { Request, Response } from "express";

import { emailValidationSuccessHtml } from "../../../config";
import type { UserAppAccess } from "../../../domain/constants";

import {
  ForgotPasswordDto,
  ResendValidationEmailDto,
  ResetPasswordDto,
} from "../../../domain/dtos";

import { LoginCorreoDto } from "../../../domain/dtos/auth/login-correo.dto";
import { LoginTelefonoDto } from "../../../domain/dtos/auth/login-telefono.dto";
import { RegisterUserDto } from "../../../domain/dtos/auth/register-user.dto";

import { AuthService } from "../../services/auth/auth.service";
import { ErrorService } from "../../services/error.service";

type AuthenticatedRequest = Request & {
  uid?: string;
  authApp?: UserAppAccess;
};

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  registerUser = async (req: Request, res: Response) => {
    try {
      const [error, registerUserDto] = RegisterUserDto.create(req.body);

      if (error) {
        return res.status(400).json({ error });
      }

      const result = await this.authService.registerUser(registerUserDto!);

      return res.status(201).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  loginCorreo = async (req: Request, res: Response) => {
    try {
      const [error, loginCorreoDto] = LoginCorreoDto.create(req.body);

      if (error) {
        return res.status(400).json({ error });
      }

      const result = await this.authService.loginCorreo(
        loginCorreoDto!.correo,
        loginCorreoDto!.password,
        loginCorreoDto!.app,
      );

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  loginTelefono = async (req: Request, res: Response) => {
    try {
      const [error, loginTelefonoDto] = LoginTelefonoDto.create(req.body);

      if (error) {
        return res.status(400).json({ error });
      }

      const result = await this.authService.loginTelefono(
        loginTelefonoDto!.telefono,
        loginTelefonoDto!.password,
        loginTelefonoDto!.app,
      );

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  forgotPassword = async (req: Request, res: Response) => {
    try {
      const [error, forgotPasswordDto] = ForgotPasswordDto.create(req.body);

      if (error) {
        return res.status(400).json({ error });
      }

      const result = await this.authService.forgotPassword(forgotPasswordDto!);

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  resetPassword = async (req: Request, res: Response) => {
    try {
      const [error, resetPasswordDto] = ResetPasswordDto.create(req.body);

      if (error) {
        return res.status(400).json({ error });
      }

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
      const authRequest = req as AuthenticatedRequest;

      const userId = String(authRequest.uid ?? "").trim();
      const app = authRequest.authApp;

      if (!userId || !app) {
        return res.status(401).json({
          error: "Sesión inválida",
        });
      }

      const result = await this.authService.renewToken(userId, app);

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  validateEmail = async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token ?? "").trim();

      await this.authService.validateEmail(token);

      return res
        .status(200)
        .type("html")
        .send(emailValidationSuccessHtml());
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };

  resendValidationEmail = async (req: Request, res: Response) => {
    try {
      const [error, resendValidationEmailDto] =
        ResendValidationEmailDto.create(req.body);

      if (error) {
        return res.status(400).json({ error });
      }

      const result = await this.authService.resendValidationEmail(
        resendValidationEmailDto!,
      );

      return res.status(200).json(result);
    } catch (error) {
      return ErrorService.handleApiError(error, res);
    }
  };
}