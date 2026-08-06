import { NextFunction, Request, Response } from "express";
import { JwtPlugin } from "../../config/plugins/jwt.plugin";
import { CustomError } from "../../domain/errors/custom.error";
import {
  hasUserModuleAccess,
  isUserAppAccess,
  isUsuarioRol,
  normalizeUserApps,
  normalizeUserModules,
  normalizeUserParkings,
  type UserAppAccess,
  type UserModuleAccess,
  UsuarioRol,
} from "../../domain/constants";
import { AuthMongoDatasource } from "../../infrastructure/datasources/auth/auth.datasource.mongo";
import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth/auth.repository.impl";

type AuthenticatedRequest = Request & {
  uid?: string;
  authApp?: UserAppAccess;
  usuario?: {
    id: string;
    nombre?: string;
    apellido?: string;
    rol: UsuarioRol;
    parkings: string[];
    modules: UserModuleAccess[];
    allowedApps: UserAppAccess[];
  };
};

const normalizeRole = (value: unknown): UsuarioRol | null => {
  return isUsuarioRol(value) ? value : null;
};

export const getAuthenticatedRequestUser = (
  req: Request,
): AuthenticatedRequest["usuario"] => {
  return (req as AuthenticatedRequest).usuario;
};

export const getAllowedProjectIdsFromRequest = (req: Request): string[] => {
  const authUser = getAuthenticatedRequestUser(req);
  return authUser?.parkings ?? [];
};

export const isSuperAdminRequest = (req: Request): boolean => {
  return getAuthenticatedRequestUser(req)?.rol === "SUPER_ROLE";
};

export const canAccessProjectFromRequest = (
  req: Request,
  projectId: string,
): boolean => {
  if (isSuperAdminRequest(req)) return true;

  const normalizedProjectId = String(projectId ?? "").trim();
  if (!normalizedProjectId) return false;

  return getAllowedProjectIdsFromRequest(req).includes(normalizedProjectId);
};

export const ensureProjectAccessFromRequest = (
  req: Request,
  projectId: string,
) => {
  if (!canAccessProjectFromRequest(req, projectId)) {
    throw CustomError.forbidden("No tienes acceso al proyecto solicitado");
  }
};

export class AuthMiddleware {
  static requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const existingAuthRequest = req as AuthenticatedRequest;

      if (
        existingAuthRequest.uid &&
        existingAuthRequest.authApp &&
        existingAuthRequest.usuario
      ) {
        return next();
      }

      const authorization = req.header("Authorization");
      const legacyToken = req.header("x-token");

      let token = legacyToken;

      if (authorization?.startsWith("Bearer ")) {
        token = authorization.split(" ")[1];
      }

      if (!token) {
        return res.status(401).json({
          error: "No token provided",
        });
      }

      const payload = await JwtPlugin.validateToken(token);

      if (!payload || typeof payload !== "object") {
        return res.status(401).json({
          error: "Invalid token",
        });
      }

      const tokenPayload = payload as {
        id?: unknown;
        app?: unknown;
      };

      const userId = String(tokenPayload.id ?? "").trim();
      const tokenApp = tokenPayload.app;

      if (!userId || !isUserAppAccess(tokenApp)) {
        return res.status(401).json({
          error: "Invalid token payload",
        });
      }

      const datasource = new AuthMongoDatasource();
      const repository = new AuthRepositoryImpl(datasource);
      const usuario = await repository.findById(userId);

      if (!usuario) {
        return res.status(401).json({
          error: "User not found",
        });
      }

      if (!usuario.estado) {
        return res.status(403).json({
          error: "Usuario inactivo",
        });
      }

      if (!usuario.emailValidated) {
        return res.status(403).json({
          error: "Debes validar tu correo primero",
        });
      }

      const normalizedRole = normalizeRole(usuario.rol);

      if (!normalizedRole) {
        return res.status(403).json({
          error: "Invalid role",
        });
      }

      const normalizedAllowedApps = normalizeUserApps(
        (usuario as { allowedApps?: unknown }).allowedApps,
      );

      if (!normalizedAllowedApps.includes(tokenApp)) {
        return res.status(403).json({
          error: "Application access revoked",
        });
      }

      const authRequest = req as AuthenticatedRequest;

      authRequest.uid = usuario.id;
      authRequest.authApp = tokenApp;

      authRequest.usuario = {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        rol: normalizedRole,
        parkings: normalizeUserParkings(
          (usuario as { parkings?: unknown }).parkings,
        ),
        modules: normalizeUserModules(
          (usuario as { modules?: unknown }).modules,
        ),
        allowedApps: normalizedAllowedApps,
      };

      next();
    } catch (_error) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }
  };

  static requireApps = (...allowedApps: UserAppAccess[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const authRequest = req as AuthenticatedRequest;

      if (!authRequest.uid || !authRequest.authApp) {
        return res.status(401).json({
          error: "Unauthorized",
        });
      }

      if (!allowedApps.includes(authRequest.authApp)) {
        return res.status(403).json({
          error: "Esta sesión no pertenece a la aplicación requerida",
        });
      }

      next();
    };
  };

  static requireRoles = (...allowedRoles: UsuarioRol[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const authRequest = req as AuthenticatedRequest;

      if (!authRequest.usuario) {
        return res.status(401).json({
          error: "Unauthorized",
        });
      }

      const userRole = authRequest.usuario.rol;

      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({
          error: "Forbidden",
        });
      }

      next();
    };
  };

  static requireModules = (...allowedModules: UserModuleAccess[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const authRequest = req as AuthenticatedRequest;

      if (!authRequest.usuario) {
        return res.status(401).json({
          error: "Unauthorized",
        });
      }

      if (allowedModules.length === 0) {
        return next();
      }

      if (authRequest.usuario.rol === "SUPER_ROLE") {
        return next();
      }

      const userModules = normalizeUserModules(authRequest.usuario.modules);
      const hasAccess = allowedModules.some((module) =>
        hasUserModuleAccess(userModules, module),
      );

      if (!hasAccess) {
        return res.status(403).json({
          error: "Forbidden",
        });
      }

      next();
    };
  };
}
