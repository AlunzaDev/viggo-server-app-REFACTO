import { Router } from "express";
import { buildAuthController } from "../../dependencies";
import { rateLimitMiddleware } from "../../middlewares";

export class AuthRoutes {
  static get routes(): Router {
    const router = Router();

    const controller = buildAuthController();
    const strictAuthRateLimit = rateLimitMiddleware({
      windowMs: 15 * 60 * 1000,
      maxRequests: 8,
    });
    const emailRateLimit = rateLimitMiddleware({
      windowMs: 15 * 60 * 1000,
      maxRequests: 4,
    });

    router.post("/register-user", strictAuthRateLimit, controller.registerUser);
    router.post("/login-correo", strictAuthRateLimit, controller.loginCorreo);
    router.post(
      "/login-telefono",
      strictAuthRateLimit,
      controller.loginTelefono,
    );
    router.post("/forgot-password", emailRateLimit, controller.forgotPassword);
    router.post(
      "/resend-validation-email",
      emailRateLimit,
      controller.resendValidationEmail,
    );
    router.get("/reset-password/:token", controller.renderResetPasswordPage);
    router.post("/reset-password", strictAuthRateLimit, controller.resetPassword);
    router.get("/validate-email/:token", controller.validateEmail);
    router.get("/renew/:id", controller.renewToken);

    return router;
  }
}
