import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { JwtPlugin } from "../../../config";
import { CustomError } from "../../../domain/errors/custom.error";
import { isUuid } from "../../../domain/helpers/uuid";
import type { TicketLabRepository } from "../../../domain/repositories/dev/ticket-lab.repository";

const MODULE_TOKEN_SECONDS = 24 * 60 * 60;
const ONLINE_MS = 60_000;

const asFinite = (value: unknown, fallback: number, min = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
};

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

export interface CreateLabTicketInput {
  userId: unknown;
  moduleId: unknown;
  minutesAgo?: unknown;
  horaInicio?: unknown;
  pagado?: unknown;
  idBoleto?: unknown;
  replaceActive?: unknown;
}

/**
 * Development-only laboratory (mounted when PROD=false): prepares tickets for the mobile app
 * without a running OPERATIVO. The app reads its current ticket from the latest completed
 * CREATE_TICKET mobile operation, so that is what the lab creates.
 */
export class TicketLabService {
  constructor(private readonly lab: TicketLabRepository) {}

  /** Users, modules and parkings to choose from, with which installation each would use. */
  async context(now = Date.now()) {
    const [users, modules, projects, installations] = await Promise.all([
      this.lab.activeUsers(), this.lab.activeModules(), this.lab.projects(), this.lab.approvedInstallations(),
    ]);
    const projectNames = new Map(projects.map((item) => [item.id, item.nombre]));
    const installationsByProject = new Map(installations.map((item) => [item.proyectoId, item]));
    const fallbackInstallation = installations[0];
    const projectsWithEntry = new Set(modules.filter((item) => item.tipo === "ENTRADA").map((item) => item.proyectoId));
    return {
      users,
      modules: modules.map((item) => ({ ...item, proyectoNombre: projectNames.get(item.proyectoId) ?? "" })),
      projects: projects.map((item) => {
        const installation = installationsByProject.get(item.id);
        const lastPollAt = installation?.lastCommandPollAt ?? 0;
        return {
          id: item.id,
          nombre: item.nombre,
          ciudad: item.ciudad,
          coordinates: item.coordinates,
          polygonPoints: polygonFrom(item.coordinates).length,
          paymentProviderId: item.paymentProviderId,
          paymentProviderName: item.paymentProviderName,
          installationId: installation?.installationId,
          installationApproved: Boolean(installation),
          hasEntryModule: projectsWithEntry.has(item.id),
          devBridgeAvailable: Boolean(installation || fallbackInstallation),
          usesDevBridge: !installation && Boolean(fallbackInstallation),
          online: lastPollAt > 0 && now - lastPollAt <= ONLINE_MS,
        };
      }),
      devBridge: fallbackInstallation
        ? { installationId: fallbackInstallation.installationId, sourceProjectId: fallbackInstallation.proyectoId }
        : null,
    };
  }

  /** The active parking whose polygon contains the point. */
  async detect(longitude: number, latitude: number) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) throw CustomError.badRequest("Coordenadas inválidas");
    const projects = (await this.lab.projects()).filter((item) => item.estado);
    const project = projects.find((item) => containsPoint(polygonFrom(item.coordinates), longitude, latitude));
    return {
      detected: Boolean(project),
      coordinates: [longitude, latitude],
      project: project ? { id: project.id, nombre: project.nombre, ciudad: project.ciudad, paymentProviderId: project.paymentProviderId, paymentProviderName: project.paymentProviderName } : null,
    };
  }

  async payments(userId: string) {
    if (!isUuid(userId)) throw CustomError.badRequest("Usuario inválido");
    return { payments: await this.lab.recentPayments(userId, 20) };
  }

  /** A device token for the module and its QR, as an entry kiosk would show it. */
  async moduleToken(moduleId: string) {
    if (!isUuid(moduleId)) throw CustomError.badRequest("moduleId inválido");
    const modulo = await this.lab.findModule(moduleId);
    if (!modulo) throw CustomError.notFound("Módulo no encontrado");
    const token = await this.signModuleToken(moduleId);
    return { token, qrDataUrl: await this.qr(token), expiresInSeconds: MODULE_TOKEN_SECONDS, module: { id: moduleId, nombre: modulo.nombre, tipo: modulo.tipo } };
  }

  /** A ticket for the user at the entry module, as the app would receive it. */
  async createTicket(input: CreateLabTicketInput, now = Date.now()) {
    const userId = String(input.userId ?? "").trim();
    const moduleId = String(input.moduleId ?? "").trim();
    if (!isUuid(userId) || !isUuid(moduleId)) throw CustomError.badRequest("userId y moduleId deben ser UUID válidos");

    const [user, modulo] = await Promise.all([this.lab.findUser(userId), this.lab.findModule(moduleId)]);
    if (!user) throw CustomError.notFound("Usuario no encontrado");
    if (!modulo) throw CustomError.notFound("Módulo no encontrado");
    if (modulo.tipo !== "ENTRADA") throw CustomError.badRequest("Selecciona un módulo de tipo ENTRADA");

    const proyectoId = modulo.proyectoId;
    const [project, installations] = await Promise.all([this.lab.findProject(proyectoId), this.lab.approvedInstallations()]);
    if (!project) throw CustomError.notFound("Proyecto no encontrado");
    const projectInstallation = installations.find((item) => item.proyectoId === proyectoId);
    const installation = projectInstallation ?? installations[0];
    if (!installation) throw CustomError.conflict("No existe ninguna instalación local aprobada que pueda usarse como puente de desarrollo");

    const minutesAgo = asFinite(input.minutesAgo, 0);
    const horaInicio = Number.isFinite(Number(input.horaInicio)) ? Number(input.horaInicio) : now - minutesAgo * 60_000;
    // Replica la regla vigente del dominio operativo para mostrar el valor inicial.
    // Al cotizar/pagar, el operativo vuelve a calcularlo con su propia implementación.
    const duracion = Math.round(Math.max(0, (now - horaInicio) / 60_000));
    const monto = duracion < 60 ? 10 : 20;
    const paid = Boolean(input.pagado);
    const ticketId = randomUUID();
    const ticket = {
      uid: ticketId,
      proyecto: { _id: proyectoId, nombre: project.nombre, ciudad: project.ciudad },
      entrada: { _id: moduleId, nombre: modulo.nombre },
      usuario: userId,
      idBoleto: String(input.idBoleto ?? `LAB-${now}`).trim(),
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
    await this.lab.createTicketOperation({
      ticketId, installationId: installation.installationId, proyectoId, usuarioId: userId, moduleId,
      devInstallationBridge: !projectInstallation, ticket, completedAt: now,
    });

    const token = await this.signModuleToken(moduleId);
    return {
      ticket,
      token,
      qrDataUrl: await this.qr(token),
      request: { userId, moduleId, minutesAgo, horaInicio, pagado: paid, replaceActive: input.replaceActive !== false },
      warning: "Datos de laboratorio; no usar fuera de desarrollo.",
    };
  }

  private async signModuleToken(moduleId: string): Promise<string> {
    const token = await JwtPlugin.generateToken(
      { id: moduleId, moduloId: moduleId, type: "DEVICE", aud: "viggo-operative-socket" },
      MODULE_TOKEN_SECONDS,
    );
    if (!token) throw CustomError.internalServer("No se pudo firmar el token del módulo");
    return String(token);
  }

  private qr(token: string) {
    return QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 2, width: 720 });
  }
}
