import { NextFunction, Request, Response } from "express";
import { envs } from "../../config";

export type SyncRequest = Request & { installationId?: string };

export const requireSyncAuth = (req: Request, res: Response, next: NextFunction) => {
  const authorization = req.header("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const installationId = req.header("X-Viggo-Installation-Id")?.trim();

  if (!envs.SYNC_SERVICE_TOKEN) {
    return res.status(503).json({ error: "SYNC_SERVICE_TOKEN no esta configurado" });
  }
  if (!token || token !== envs.SYNC_SERVICE_TOKEN) {
    return res.status(401).json({ error: "Invalid service token" });
  }
  if (!installationId) {
    return res.status(400).json({ error: "X-Viggo-Installation-Id es requerido" });
  }

  (req as SyncRequest).installationId = installationId;
  next();
};
