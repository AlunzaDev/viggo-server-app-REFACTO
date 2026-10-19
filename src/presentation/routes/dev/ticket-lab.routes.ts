import { randomUUID } from "crypto";
import { Router } from "express";
import QRCode from "qrcode";

import { JwtPlugin } from "../../../config";
import { PostgresDatabase } from "../../../data/postgres";
import { isUuid } from "../../../infrastructure/datasources/postgres/prisma-errors";
import { ticketLabPageHtml } from "./ticket-lab.page";

const asFinite = (value: unknown, fallback: number, min = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
};

const serializeError = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo preparar el escenario";

const buildModuleToken = async (moduleId: string): Promise<string> => {
  const token = await JwtPlugin.generateToken(
    { id: moduleId, moduloId: moduleId, type: "DEVICE", aud: "viggo-operative-socket" },
    24 * 60 * 60,
  );
  if (!token) throw new Error("No se pudo firmar el token del módulo");
  return String(token);
};

const buildQr = (token: string) =>
  QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 2, width: 720 });

const polygonFrom = (value: unknown): number[][] => {
  if (!Array.isArray(value)) return [];
  const source = Array.isArray(value[0]) && Array.isArray((value[0] as unknown[])[0]) ? value[0] : value;
  return source.filter(Array.isArray).map((point) => [Number(point[0]), Number(point[1])]).filter((point) => point.length >= 2 && point.every(Number.isFinite));
};

const containsPoint = (polygon: number[][], longitude: number, latitude: number) => {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]; const [xj, yj] = polygon[j];
    if ((yi > latitude) !== (yj > latitude) && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/**
 * Development-only laboratory (mounted when PROD=false): prepares tickets for the mobile app
 * without a running OPERATIVO. The app reads its current ticket from the latest completed
 * CREATE_TICKET mobile operation, so that is what the lab creates.
 */
export class TicketLabRoutes {
  static get routes(): Router {
    const router = Router();
    const db = () => PostgresDatabase.client;

    router.get("/", (_req, res) => res.type("html").send(ticketLabPageHtml()));

    router.get("/context", async (_req, res) => {
      try {
        const [users, modules, projects, installations] = await Promise.all([
          db().usuario.findMany({ where: { estado: true }, orderBy: { correo: "asc" } }),
          db().modulo.findMany({ where: { estado: true }, orderBy: { nombre: "asc" } }),
          db().proyecto.findMany({ include: { paymentProviderRelation: true } }),
          db().localInstallation.findMany({ where: { status: "approved" }, orderBy: { createdAt: "asc" } }),
        ]);
        const projectNames = new Map(projects.map((item) => [item.id, item.nombre]));
        const installationsByProject = new Map(installations.map((item) => [item.proyectoId, item]));
        const fallbackInstallation = installations[0];
        const projectsWithEntry = new Set(
          modules.filter((item) => item.tipo === "ENTRADA").map((item) => item.proyectoId),
        );
        const now = Date.now();
        return res.json({
          users: users.map((item) => ({ id: item.id, nombre: `${item.nombre} ${item.apellido}`.trim(), correo: item.correo })),
          modules: modules.map((item) => ({ id: item.id, nombre: item.nombre, tipo: item.tipo, proyectoId: item.proyectoId, proyectoNombre: projectNames.get(item.proyectoId) ?? "" })),
          projects: projects.map((item) => {
            const installation = installationsByProject.get(item.id);
            const lastPollAt = installation?.lastCommandPollAt?.getTime() ?? 0;
            return {
              id: item.id,
              nombre: item.nombre,
              ciudad: item.ciudad ?? "",
              coordinates: item.coordinates,
              polygonPoints: polygonFrom(item.coordinates).length,
              paymentProviderId: item.paymentProviderId ?? "",
              paymentProviderName: item.paymentProviderRelation?.nombre ?? "Sin proveedor",
              installationId: installation?.installationId,
              installationApproved: Boolean(installation),
              hasEntryModule: projectsWithEntry.has(item.id),
              devBridgeAvailable: Boolean(installation || fallbackInstallation),
              usesDevBridge: !installation && Boolean(fallbackInstallation),
              online: lastPollAt > 0 && now - lastPollAt <= 60_000,
            };
          }),
          devBridge: fallbackInstallation
            ? { installationId: fallbackInstallation.installationId, sourceProjectId: fallbackInstallation.proyectoId }
            : null,
        });
      } catch (error) {
        return res.status(500).json({ error: serializeError(error) });
      }
    });

    router.post("/detect", async (req, res) => {
      try {
        const longitude = Number(req.body?.longitude); const latitude = Number(req.body?.latitude);
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return res.status(400).json({ error: "Coordenadas inválidas" });
        const projects = await db().proyecto.findMany({ where: { estado: true }, include: { paymentProviderRelation: true } });
        const project = projects.find((item) => containsPoint(polygonFrom(item.coordinates), longitude, latitude));
        return res.json({ detected: Boolean(project), coordinates: [longitude, latitude], project: project ? { id: project.id, nombre: project.nombre, ciudad: project.ciudad, paymentProviderId: project.paymentProviderId ?? "", paymentProviderName: project.paymentProviderRelation?.nombre ?? "Sin proveedor" } : null });
      } catch (error) { return res.status(500).json({ error: serializeError(error) }); }
    });

    router.get("/payments/:userId", async (req, res) => {
      try {
        const userId = String(req.params.userId); if (!isUuid(userId)) return res.status(400).json({ error: "Usuario inválido" });
        const payments = await db().payment.findMany({ where: { usuarioId: userId }, orderBy: { paidAt: "desc" }, take: 20 });
        return res.json({ payments: payments.map((item) => ({ id: item.id, concept: item.concept, amount: Number(item.amount), currency: item.currency, status: item.status, paidAt: item.paidAt.getTime(), parkingName: item.parkingName, parkingCity: item.parkingCity, referenceId: item.referenceId, reconciliationStatus: item.reconciliationStatus })) });
      } catch (error) { return res.status(500).json({ error: serializeError(error) }); }
    });

    router.post("/module-token", async (req, res) => {
      try {
        const moduleId = String(req.body?.moduleId ?? "").trim();
        if (!isUuid(moduleId)) return res.status(400).json({ error: "moduleId inválido" });
        const modulo = await db().modulo.findUnique({ where: { id: moduleId } });
        if (!modulo) return res.status(404).json({ error: "Módulo no encontrado" });
        const token = await buildModuleToken(moduleId);
        return res.json({ token, qrDataUrl: await buildQr(token), expiresInSeconds: 86400, module: { id: moduleId, nombre: modulo.nombre, tipo: modulo.tipo } });
      } catch (error) {
        return res.status(500).json({ error: serializeError(error) });
      }
    });

    router.post("/tickets", async (req, res) => {
      try {
        const userId = String(req.body?.userId ?? "").trim();
        const moduleId = String(req.body?.moduleId ?? "").trim();
        if (!isUuid(userId) || !isUuid(moduleId)) {
          return res.status(400).json({ error: "userId y moduleId deben ser UUID válidos" });
        }

        const [user, modulo] = await Promise.all([
          db().usuario.findUnique({ where: { id: userId } }),
          db().modulo.findUnique({ where: { id: moduleId } }),
        ]);
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!modulo) return res.status(404).json({ error: "Módulo no encontrado" });
        if (modulo.tipo !== "ENTRADA") return res.status(400).json({ error: "Selecciona un módulo de tipo ENTRADA" });

        const proyectoId = modulo.proyectoId;
        const [project, projectInstallation, fallbackInstallation] = await Promise.all([
          db().proyecto.findUnique({ where: { id: proyectoId } }),
          db().localInstallation.findFirst({ where: { proyectoId, status: "approved" } }),
          db().localInstallation.findFirst({ where: { status: "approved" }, orderBy: { createdAt: "asc" } }),
        ]);
        if (!project) return res.status(404).json({ error: "Proyecto no encontrado" });
        const installation = projectInstallation ?? fallbackInstallation;
        if (!installation) return res.status(409).json({ error: "No existe ninguna instalación local aprobada que pueda usarse como puente de desarrollo" });

        const minutesAgo = asFinite(req.body?.minutesAgo, 0);
        const horaInicio = Number.isFinite(Number(req.body?.horaInicio))
          ? Number(req.body.horaInicio)
          : Date.now() - minutesAgo * 60_000;
        const rawMinutes = Math.max(0, (Date.now() - horaInicio) / 60_000);
        // Replica la regla vigente del dominio operativo para mostrar el valor inicial.
        // Al cotizar/pagar, el operativo vuelve a calcularlo con su propia implementación.
        const duracion = Math.round(rawMinutes);
        const monto = duracion < 60 ? 10 : 20;
        const now = Date.now();
        const paid = Boolean(req.body?.pagado);

        const ticketId = randomUUID();
        const idBoleto = String(req.body?.idBoleto ?? `LAB-${now}`).trim();
        const ticket = {
          uid: ticketId,
          proyecto: { _id: proyectoId, nombre: project.nombre, ciudad: project.ciudad ?? "---" },
          entrada: { _id: moduleId, nombre: modulo.nombre },
          usuario: userId,
          idBoleto,
          horaInicio,
          horaConsulta: now,
          horaCobro: paid ? now : -1,
          horaSalida: -1,
          duracion,
          monto,
          pagado: paid,
        };
        // The newest completed CREATE_TICKET is the user's current ticket, so the lab ticket
        // replaces any previous one without touching other data.
        await db().mobileOperation.create({
          data: {
            operationId: randomUUID(),
            idempotencyKey: `dev-ticket-lab:${randomUUID()}`,
            type: "CREATE_TICKET",
            installationId: installation.installationId,
            proyectoId,
            usuarioId: userId,
            payload: { source: "ticket-lab", moduleId, devInstallationBridge: !projectInstallation },
            result: { ticket },
            ticketId,
            status: "completed",
            attempts: 1,
            maxAttempts: 1,
            completedAt: new Date(now),
          },
        });

        const token = await buildModuleToken(moduleId);
        return res.status(201).json({
          ticket,
          token,
          qrDataUrl: await buildQr(token),
          request: { userId, moduleId, minutesAgo, horaInicio, pagado: paid, replaceActive: req.body?.replaceActive !== false },
          warning: "Datos de laboratorio; no usar fuera de desarrollo.",
        });
      } catch (error) {
        return res.status(500).json({ error: serializeError(error) });
      }
    });

    return router;
  }
}
