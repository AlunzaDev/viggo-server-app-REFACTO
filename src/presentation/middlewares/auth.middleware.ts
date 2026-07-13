import { NextFunction, Request, Response } from "express";
import { JwtPlugin } from "../../config/plugins/jwt.plugin";
import { UsuarioRol } from "../../domain/constants";
import { AuthMongoDatasource } from "../../infrastructure/datasources/auth/auth.datasource.mongo";
import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth/auth.repository.impl";

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

      (req as Request & { uid?: string; usuario?: unknown }).uid = usuario.id;
      (req as Request & { uid?: string; usuario?: unknown }).usuario = usuario;

      next();
    } catch (_error) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }
  };

  static requireRoles = (...allowedRoles: UsuarioRol[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const authRequest = req as Request & {
        usuario?: { rol?: UsuarioRol };
      };

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
}
