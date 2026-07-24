import { NextFunction, Request, Response } from "express";
import { JwtPlugin } from "../../config/plugins/jwt.plugin";
import { CustomError } from "../../domain/errors/custom.error";
import {
  hasUserModuleAccess,
  isUsuarioRol,
  normalizeUserParkings,
  normalizeUserModules,
  type UserModuleAccess,
  UsuarioRol,
} from "../../domain/constants";
import { AuthMongoDatasource } from "../../infrastructure/datasources/auth/auth.datasource.mongo";
import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth/auth.repository.impl";

type AuthenticatedRequest = Request & {
  uid?: string;
  usuario?: {
    id: string;
    nombre?: string;
    apellido?: string;
    rol: UsuarioRol;
    parkings: string[];
    modules: UserModuleAccess[];
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

      if (!payload || typeof payload !== "object" || !("id" in payload)) {
        return res.status(401).json({
          error: "Invalid token",
        });
      }

      const userId = String((payload as { id: string }).id);

      const datasource = new AuthMongoDatasource();
      const repository = new AuthRepositoryImpl(datasource);
      const usuario = await repository.findById(userId);

      if (!usuario || !usuario.estado) {
        return res.status(401).json({
          error: "User not found or inactive",
        });
      }

      const normalizedRole = normalizeRole(usuario.rol);

      if (!normalizedRole) {
        return res.status(403).json({
          error: "Invalid role",
        });
      }

      (req as AuthenticatedRequest).uid = usuario.id;
      (req as AuthenticatedRequest).usuario = {
        ...usuario,
        rol: normalizedRole,
        parkings: normalizeUserParkings((usuario as { parkings?: unknown }).parkings),
        modules: normalizeUserModules((usuario as { modules?: unknown }).modules),
      };

      next();
    } catch (_error) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }
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
