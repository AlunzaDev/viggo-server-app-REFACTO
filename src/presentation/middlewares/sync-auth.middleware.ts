import { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import type { LinkTokenProject } from "../../domain/datasources/sync/sync.datasource";
import type { InstallationsRepository } from "../../domain/repositories/installations/installations.repository";
import type { SyncRepository } from "../../domain/repositories/sync/sync.repository";
import { buildInstallationsRepository, buildSyncRepository } from "../dependencies/repositories.dependencies";

/**
 * Request authenticated by an OPERATIVO installation. `proyectoId` is the project that
 * installation is linked to; handlers must never serve or accept data of another project.
 */
export type SyncRequest = Request & {
  installationId?: string;
  proyectoId?: string;
  /** Set when authenticated with a project's link token (linking flow only). */
  linkProject?: LinkTokenProject;
  /** Hash of the sync token the installation authenticated with. */
  syncTokenHash?: string;
};

export const SYNC_TOKEN_ROTATION_HEADER = "X-Viggo-Sync-Token-Rotation";

let installations: InstallationsRepository | undefined;
let sync: SyncRepository | undefined;

const credentials = (req: Request) => {
  const authorization = req.header("Authorization") ?? "";
  return {
    token: authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "",
    installationId: req.header("X-Viggo-Installation-Id")?.trim() ?? "",
  };
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Operating endpoints: the installation's own sync token, issued when its link request was
 * approved (only its hash is stored). There is no shared or global token.
 */
export const requireInstallationAuth = async (req: Request, res: Response, next: NextFunction) => {
  const { token, installationId } = credentials(req);
  if (!token) return res.status(401).json({ error: "Invalid installation token" });
  if (!installationId) return res.status(400).json({ error: "X-Viggo-Installation-Id es requerido" });

  try {
    installations ??= buildInstallationsRepository();
    const syncTokenHash = sha256(token);
    const installation = await installations.authenticateSyncToken(installationId, syncTokenHash);
    if (!installation) return res.status(401).json({ error: "Invalid installation token" });

    (req as SyncRequest).installationId = installation.installationId;
    (req as SyncRequest).proyectoId = installation.proyectoId;
    (req as SyncRequest).syncTokenHash = syncTokenHash;
    // An administrator asked for a new token: the installation rotates on seeing this.
    if (installation.rotationRequested) res.setHeader(SYNC_TOKEN_ROTATION_HEADER, "required");
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Linking endpoints: the project's installation link token (generated in ADMINISTRATIVO and
 * typed by the operator). It identifies the project, so the installation never chooses it.
 */
export const requireLinkTokenAuth = async (req: Request, res: Response, next: NextFunction) => {
  const { token, installationId } = credentials(req);
  if (!token) return res.status(401).json({ error: "Token de vinculacion requerido" });
  if (!installationId) return res.status(400).json({ error: "X-Viggo-Installation-Id es requerido" });

  try {
    sync ??= buildSyncRepository();
    const project = await sync.findProjectByLinkToken(token);
    if (!project) return res.status(401).json({ error: "Token de vinculacion invalido" });

    (req as SyncRequest).installationId = installationId;
    (req as SyncRequest).proyectoId = project.id;
    (req as SyncRequest).linkProject = project;
    return next();
  } catch (error) {
    return next(error);
  }
};

/** 403 unless `proyectoId` is the authenticated installation's project. */
export const isOwnProject = (req: Request, proyectoId: string) =>
  Boolean(proyectoId) && proyectoId === (req as SyncRequest).proyectoId;
