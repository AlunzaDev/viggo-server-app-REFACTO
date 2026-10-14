import { Router } from "express";
import { buildAuthController } from "../../dependencies";
import { envs } from "../../../config";
import { AuthMiddleware, loginAttemptLimiter, rateLimitMiddleware } from "../../middlewares";

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

    // Only failed logins count, so normal use and manual testing are not blocked.
    const loginLimit = (accountField: string) =>
      loginAttemptLimiter({
        windowMs: envs.AUTH_LOGIN_WINDOW_MS,
        maxFailuresPerAccount: envs.AUTH_LOGIN_MAX_FAILURES,
        maxFailuresPerIp: envs.AUTH_LOGIN_IP_MAX_FAILURES,
        accountField,
      });

    router.post("/register-user", strictAuthRateLimit, controller.registerUser);
    router.post("/login-correo", loginLimit("correo"), controller.loginCorreo);
    router.post("/login-telefono", loginLimit("telefono"), controller.loginTelefono);
    router.post("/forgot-password", emailRateLimit, controller.forgotPassword);
    router.post(
      "/resend-validation-email",
      emailRateLimit,
      controller.resendValidationEmail,
    );
    router.get("/reset-password/:token", controller.renderResetPasswordPage);
    router.post(
      "/reset-password",
      strictAuthRateLimit,
      controller.resetPassword,
    );
    router.get("/validate-email/:token", controller.validateEmail);
    router.get("/renew", AuthMiddleware.requireAuth, controller.renewToken);

    return router;
  }
}
