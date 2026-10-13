import { NextFunction, Request, Response } from "express";
import { envs } from "../../config";
import { createHash, timingSafeEqual } from "node:crypto";
import type { InstallationsRepository } from "../../domain/repositories/installations/installations.repository";
import { buildInstallationsRepository } from "../dependencies/repositories.dependencies";

export type SyncRequest = Request & { installationId?: string };

let installations: InstallationsRepository | undefined;

export const requireSyncAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authorization = req.header("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const installationId = req.header("X-Viggo-Installation-Id")?.trim();

  if (!token) {
    return res.status(401).json({ error: "Invalid service token" });
  }
  if (!installationId) {
    return res.status(400).json({ error: "X-Viggo-Installation-Id es requerido" });
  }

  let valid = Boolean(envs.SYNC_SERVICE_TOKEN) && token === envs.SYNC_SERVICE_TOKEN;
  if (!valid) {
    installations ??= buildInstallationsRepository();
    const expected = await installations.findApprovedLinkTokenHash(installationId);
    const actual = createHash("sha256").update(token).digest("hex");
    valid = Boolean(expected) && expected.length === actual.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  }
  if (!valid) return res.status(401).json({ error: "Invalid service token" });

  (req as SyncRequest).installationId = installationId;
  return next();
};
