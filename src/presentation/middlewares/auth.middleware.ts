import { NextFunction, Request, Response } from "express";
import { buildAuthRepository, buildPermissionProfileRepository } from "../dependencies/repositories.dependencies";
import { JwtPlugin } from "../../config/plugins/jwt.plugin";
import {
  hasUserModuleAccess,
  isRoleAllowedForApp,
  isUserAppAccess,
  isUsuarioRol,
  normalizeUserApps,
  normalizeUserModules,
  normalizeUserParkings,
  type UserAppAccess,
  type UserModuleAccess,
  type UsuarioRol,
} from "../../domain/constants";
import type { UsuarioEntity } from "../../domain/entities/auth/usuario.entity";
import { CustomError } from "../../domain/errors/custom.error";
import { canAccessProject, type ProjectAccess } from "../../domain/entities/auth/project-access";

type AuthenticatedRequest = Request & {
  uid?: string;
  authApp?: UserAppAccess;
  usuario?: {
    id: string;
    nombre?: string;
    apellido?: string;
    rol: UsuarioRol;
    parkings: string[];
    permissionProfileId?: string;
    modules: UserModuleAccess[];
    allowedApps: UserAppAccess[];
  };
};

interface ResolvedApplicationPermissions {
  permissionProfileId?: string;
  modules: UserModuleAccess[];
}

const authRepository = buildAuthRepository();

const permissionProfileRepository = buildPermissionProfileRepository();

const normalizeRole = (value: unknown): UsuarioRol | null =>
  isUsuarioRol(value) ? value : null;

const resolveApplicationPermissions = async (
  usuario: UsuarioEntity,
  app: UserAppAccess,
): Promise<ResolvedApplicationPermissions> => {
  const appPermission = usuario.appPermissions.find(
    (permission) => permission.app === app,
  );

  if (appPermission) {
    const profile = await permissionProfileRepository.findById(
      appPermission.permissionProfileId,
    );

    if (!profile || !profile.estado) {
      throw CustomError.forbidden(
        "El perfil de permisos asignado no existe o está inactivo",
      );
    }

    if (profile.app !== app) {
      throw CustomError.forbidden(
        "El perfil de permisos asignado no pertenece a esta aplicación",
      );
    }

    return {
      permissionProfileId: profile.id,
      modules: normalizeUserModules(profile.modules),
    };
  }

  if (app === "OPERATIVE_MOBILE") {
    return {
      modules: [],
    };
  }

  throw CustomError.forbidden(
    "No tienes un perfil de permisos asignado para esta aplicación",
  );
};

export const getAuthenticatedRequestUser = (
  req: Request,
): AuthenticatedRequest["usuario"] => (req as AuthenticatedRequest).usuario;

export const getAllowedProjectIdsFromRequest = (req: Request): string[] =>
  getAuthenticatedRequestUser(req)?.parkings ?? [];

export const isSuperAdminRequest = (req: Request): boolean =>
  getAuthenticatedRequestUser(req)?.rol === "SUPER_ROLE";

/** The parkings the authenticated user may see, for services to apply (no `req` there). */
export const projectAccessFromRequest = (req: Request): ProjectAccess => ({
  all: isSuperAdminRequest(req),
  allowed: getAllowedProjectIdsFromRequest(req),
});

export const canAccessProjectFromRequest = (
  req: Request,
  projectId: string,
): boolean => canAccessProject(projectAccessFromRequest(req), projectId);

export const ensureProjectAccessFromRequest = (
  req: Request,
  projectId: string,
): void => {
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
        token = authorization.slice("Bearer ".length).trim();
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

      const usuario = await authRepository.findById(userId);

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

      if (!isRoleAllowedForApp(normalizedRole, tokenApp)) {
        return res.status(403).json({
          error: "Tu rol no permite acceder a esta aplicación",
        });
      }

      const normalizedAllowedApps = normalizeUserApps(usuario.allowedApps);

      if (!normalizedAllowedApps.includes(tokenApp)) {
        return res.status(403).json({
          error: "Application access revoked",
        });
      }

      const resolvedPermissions = await resolveApplicationPermissions(
        usuario,
        tokenApp,
      );

      const authRequest = req as AuthenticatedRequest;

      authRequest.uid = usuario.id;
      authRequest.authApp = tokenApp;
      authRequest.usuario = {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        rol: normalizedRole,
        parkings: normalizeUserParkings(usuario.parkings),
        permissionProfileId: resolvedPermissions.permissionProfileId,
        modules: resolvedPermissions.modules,
        allowedApps: normalizedAllowedApps,
      };

      return next();
    } catch (error) {
      const normalizedError = CustomError.fromUnknown(
        error,
        "No se pudo validar la sesión",
      );

      return res.status(normalizedError.statusCode).json({
        error: normalizedError.message,
        code: normalizedError.code,
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

      return next();
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

      if (!allowedRoles.includes(authRequest.usuario.rol)) {
        return res.status(403).json({
          error: "Forbidden",
        });
      }

      return next();
    };
  };

  static protectSuperUser = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const actor = getAuthenticatedRequestUser(req);
    if (!actor) return res.status(401).json({ error: "Unauthorized" });
    if (actor.rol === "SUPER_ROLE") return next();

    if (req.body?.rol === "SUPER_ROLE") {
      return res.status(403).json({
        error: "Solo un super administrador puede asignar SUPER_ROLE",
      });
    }

    const targetId = String(req.params.id ?? "").trim();
    if (!targetId) return next();

    const target = await authRepository.findById(targetId);
    if (target?.rol === "SUPER_ROLE") {
      return res.status(403).json({
        error: "Solo un super administrador puede modificar esta cuenta",
      });
    }

    return next();
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

      return next();
    };
  };
}
