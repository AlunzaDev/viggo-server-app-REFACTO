import { randomUUID } from "crypto";
import { Router } from "express";
import mongoose, { Types } from "mongoose";
import QRCode from "qrcode";

import { envs, JwtPlugin } from "../../../config";
import {
  MobileOperationModel,
  ModuloModel,
  ProyectoModel,
  UsuarioModel,
} from "../../../data/mongo";
import { LocalInstallationRequestModel } from "../../../data/mongo/models/system/local-installation-request.schema";
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

export class TicketLabRoutes {
  static get routes(): Router {
    const router = Router();

    router.get("/", (_req, res) => res.type("html").send(ticketLabPageHtml()));

    router.get("/context", async (_req, res) => {
      try {
        const [users, modules, projects, installations] = await Promise.all([
          UsuarioModel.find({ estado: { $ne: false } }).sort({ correo: 1 }).lean(),
          ModuloModel.find({ estado: { $ne: false } }).sort({ nombre: 1 }).lean(),
          ProyectoModel.find({}).lean(),
          LocalInstallationRequestModel.find({ status: "approved" }).lean(),
        ]);
        const projectNames = new Map(projects.map((item) => [String(item._id), item.nombre]));
        const installationsByProject = new Map(
          installations.map((item) => [String(item.proyectoId), item]),
        );
        const fallbackInstallation = installations[0];
        const projectsWithEntry = new Set(
          modules
            .filter((item) => item.tipo === "ENTRADA")
            .map((item) => String(item.proyecto)),
        );
        const now = Date.now();
        return res.json({
          users: users.map((item) => ({ id: String(item._id), nombre: `${item.nombre} ${item.apellido}`.trim(), correo: item.correo })),
          modules: modules.map((item) => ({ id: String(item._id), nombre: item.nombre, tipo: item.tipo, proyectoId: String(item.proyecto), proyectoNombre: projectNames.get(String(item.proyecto)) ?? "" })),
          projects: projects
            .map((item) => {
              const installation = installationsByProject.get(String(item._id));
              const lastPollAt = Number(installation?.lastCommandPollAt ?? 0);
              return {
                id: String(item._id),
                nombre: item.nombre,
                ciudad: item.ciudad ?? "",
                installationId: installation?.installationId,
                installationApproved: Boolean(installation),
                hasEntryModule: projectsWithEntry.has(String(item._id)),
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

    router.post("/module-token", async (req, res) => {
      try {
        const moduleId = String(req.body?.moduleId ?? "").trim();
        if (!Types.ObjectId.isValid(moduleId)) return res.status(400).json({ error: "moduleId inválido" });
        const modulo = await ModuloModel.findById(moduleId).lean();
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
        if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(moduleId)) {
          return res.status(400).json({ error: "userId y moduleId deben ser ObjectId válidos" });
        }

        const [user, modulo] = await Promise.all([
          UsuarioModel.findById(userId).lean(),
          ModuloModel.findById(moduleId).lean(),
        ]);
        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
        if (!modulo) return res.status(404).json({ error: "Módulo no encontrado" });
        if (modulo.tipo !== "ENTRADA") return res.status(400).json({ error: "Selecciona un módulo de tipo ENTRADA" });

        const proyectoId = String(modulo.proyecto);
        const [project, projectInstallation, fallbackInstallation] = await Promise.all([
          ProyectoModel.findById(proyectoId).lean(),
          LocalInstallationRequestModel.findOne({ proyectoId, status: "approved" }).lean(),
          LocalInstallationRequestModel.findOne({ status: "approved" }).lean(),
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
        const tickets = mongoose.connection.collection("tickets");

        if (req.body?.replaceActive !== false) {
          await tickets.updateMany(
            { usuario: new Types.ObjectId(userId), horaSalida: -1 },
            { $set: { horaSalida: now, status: "COMPLETED" } },
          );
        }

        const ticketId = new Types.ObjectId();
        const idBoleto = String(req.body?.idBoleto ?? `LAB-${now}`).trim();
        const ticketDocument = {
          _id: ticketId,
          proyecto: new Types.ObjectId(proyectoId),
          entrada: new Types.ObjectId(moduleId),
          usuario: new Types.ObjectId(userId),
          idBoleto,
          horaInicio,
          horaConsulta: now,
          horaCobro: paid ? now : -1,
          horaSalida: -1,
          duracion,
          monto,
          pagado: paid,
          status: "ACTIVE",
          barrierOpenedAt: -1,
          barrierConfirmedAt: -1,
          fraudDetectedAt: -1,
          fraudReason: "",
          runtimeEventIds: [],
        };
        await tickets.insertOne(ticketDocument);

        const ticket = {
          uid: String(ticketId),
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
        await MobileOperationModel.create({
          operationId: randomUUID(),
          idempotencyKey: `dev-ticket-lab:${randomUUID()}`,
          type: "CREATE_TICKET",
          installationId: installation.installationId,
          proyectoId,
          userId,
          payload: { source: "ticket-lab", moduleId, devInstallationBridge: !projectInstallation },
          result: { ticket },
          status: "completed",
          attempts: 1,
          maxAttempts: 1,
          completedAt: now,
          createdAt: now,
          updatedAt: now,
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
