import { createHash } from "node:crypto";
import { PermissionProfileModel } from "../../../data/mongo/models/auth/permission-profile.schema";
import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import { ModuloModel } from "../../../data/mongo/models/parking/modulo.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { PensionPassModel } from "../../../data/mongo/models/pension/pension-pass.schema";
import { PensionModel } from "../../../data/mongo/models/pension/pension.schema";
import { ProjectHeartbeatSnapshotModel } from "../../../data/mongo/models/system/project-heartbeat-snapshot.schema";
import { InboxEventModel } from "../../../data/mongo/models/sync/inbox-event.schema";
import { LocalInstallationRequestModel } from "../../../data/mongo/models/system/local-installation-request.schema";
import {
  SyncDatasource,
  type HeartbeatSnapshotPayload,
  type InboxEventPayload,
  type InstallationLinkRequestPayload,
} from "../../../domain/datasources/sync/sync.datasource";

const USER_SYNC_SELECT =
  "nombre apellido correo telefono coordinates password emailValidated rol parkings permissionProfileId modules allowedApps nacimiento img estado google";

  const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const buildStableVersion = (payload: unknown): number => {
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 10);

  return parseInt(hash, 16);
};

export class SyncMongoDatasource implements SyncDatasource {
  async getConfiguration(proyectoId: string) {
    const proyecto = await ProyectoModel.findById(proyectoId).lean();
    if (!proyecto) return null;

    const [modulos, pensiones] = await Promise.all([
      ModuloModel.find({ proyecto: proyectoId })
        .select(
          [
            "nombre",
            "proyecto",
            "tipo",
            "estado",
            "identificador",
            "ip",
            "mac",
            "ubicacion",
            "coordinates",
            "descripcion",
            "submodulos.submoduloId",
            "submodulos.nombre",
            "submodulos.tipo",
            "submodulos.identificador",
            "submodulos.ip",
            "submodulos.mac",
            "submodulos.ubicacion",
            "submodulos.coordinates",
            "submodulos.descripcion",
            "submodulos.estado",
          ].join(" "),
        )
        .lean(),
      PensionModel.find({ proyecto: proyectoId }).lean(),
    ]);
    const pensionIds = pensiones.map((item) => String(item._id));
    const pensionPasses = await PensionPassModel.find({
      pension: { $in: pensionIds },
    })
      .select(
        "usuario name pension idPass vigent created from to estado antiPassback",
      )
      .lean();

    const snapshot = { proyecto, modulos, pensiones, pensionPasses };
    return { version: buildStableVersion(snapshot), ...snapshot };
  }

  getProjectsCatalog() {
    return ProyectoModel.find({ estado: true })
      .select(
        "nombre ciudad direccion identificador codigoProyecto serverIp serverMac localApiBaseUrl img descripcion estado coordinates",
      )
      .sort({ nombre: 1 })
      .lean();
  }

  async getAccessSnapshot(proyectoId: string) {
    const proyecto = await ProyectoModel.findById(proyectoId).lean();
    if (!proyecto) return null;

    const users = await UsuarioModel.find({
      $or: [{ parkings: proyectoId }, { rol: "SUPER_ROLE" }],
    })
      .select(USER_SYNC_SELECT)
      .lean();

    const profileIds = [
      ...new Set(
        users
          .map((user) => user.permissionProfileId)
          .filter(
            (profileId): profileId is string => typeof profileId === "string",
          ),
      ),
    ];
    const permissionProfiles = profileIds.length
      ? await PermissionProfileModel.find({ _id: { $in: profileIds } }).lean()
      : [];

    const snapshot = { proyectoId, users, permissionProfiles };
    return { version: buildStableVersion(snapshot), ...snapshot };
  }

  getAccessUserByCorreo(correo: string) {
    return UsuarioModel.findOne({ correo }).select(USER_SYNC_SELECT).lean();
  }

  getAccessUserByTelefono(telefono: string) {
    return UsuarioModel.findOne({ telefono }).select(USER_SYNC_SELECT).lean();
  }

  async requestInstallationLink(payload: InstallationLinkRequestPayload) {
    const proyecto = await ProyectoModel.findById(payload.proyectoId).lean();
    if (!proyecto) return { status: "missing-project" as const };

    const expectedTokenHash = String(
      proyecto.installationLinkTokenHash ?? "",
    ).trim();
    if (!expectedTokenHash) return { status: "missing-token" as const };
    if (hashToken(payload.installationLinkToken) !== expectedTokenHash) {
      return { status: "invalid-token" as const };
    }

    const existing = await LocalInstallationRequestModel.findOne({
      installationId: payload.installationId,
    }).lean();
    if (
      existing?.status === "approved" &&
      existing.proyectoId !== payload.proyectoId
    ) {
      return {
        status: "already-approved-other-project" as const,
        request: existing,
      };
    }

    const now = Date.now();
    const request = await LocalInstallationRequestModel.findOneAndUpdate(
      { installationId: payload.installationId },
      {
        installationId: payload.installationId,
        proyectoId: payload.proyectoId,
        proyectoNombre: String(proyecto.nombre ?? ""),
        proyectoIdentificador: String(proyecto.identificador ?? ""),
        localApiBaseUrl: payload.localApiBaseUrl,
        serverIp: payload.serverIp,
        serverMac: payload.serverMac,
        browserCoordinates: payload.browserCoordinates,
        browserLocationAccuracy: payload.browserLocationAccuracy,
        browserLocationCapturedAt: payload.browserLocationCapturedAt,
        status: existing?.status === "approved" ? "approved" : "pending",
        requestedByUserId: payload.requestedByUserId,
        requestedByUserName: payload.requestedByUserName,
        requestedAt:
          existing?.status === "pending" ? existing.requestedAt : now,
        reviewedByUserId:
          existing?.status === "approved" ? existing.reviewedByUserId : "",
        reviewedByUserName:
          existing?.status === "approved" ? existing.reviewedByUserName : "",
        reviewedAt:
          existing?.status === "approved" ? existing.reviewedAt : undefined,
        reviewNote: existing?.status === "approved" ? existing.reviewNote : "",
        updatedAt: now,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();

    return { status: "ok" as const, request };
  }

  async getInstallationRequestStatus(installationId: string) {
    const requestDocument = await LocalInstallationRequestModel.findOne({
      installationId,
    });
    const request = requestDocument?.toObject();
    const proyecto =
      request?.status === "approved"
        ? await ProyectoModel.findById(request.proyectoId).lean()
        : null;

    return { request, proyecto, oneTimeSyncToken: null };
  }

  async receiveHeartbeatSnapshot(payload: HeartbeatSnapshotPayload) {
    const proyecto = await ProyectoModel.findById(payload.proyectoId).lean();
    if (!proyecto) {
      return {
        accepted: false,
        proyectoId: payload.proyectoId,
        reason: "PROJECT_NOT_FOUND",
      };
    }

    const receivedAt = Date.now();
    await ProjectHeartbeatSnapshotModel.findOneAndUpdate(
      { proyectoId: payload.proyectoId },
      {
        proyectoId: payload.proyectoId,
        installationId: payload.installationId,
        source: payload.source,
        generatedAt: payload.generatedAt,
        receivedAt,
        summary: payload.summary,
        modules: payload.modules,
        metadata: {
          ...(payload.metadata ?? {}),
          proyectoNombre: String(proyecto.nombre ?? ""),
          proyectoIdentificador: String(proyecto.identificador ?? ""),
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    return {
      accepted: true,
      proyectoId: payload.proyectoId,
      receivedAt,
    };
  }

  async receiveEvent(payload: InboxEventPayload) {
    const existing = await InboxEventModel.findOne({
      eventId: payload.eventId,
    }).lean();
    if (existing)
      return { accepted: true, duplicate: true, eventId: payload.eventId };

    await InboxEventModel.create(payload);
    return { accepted: true, duplicate: false, eventId: payload.eventId };
  }
}
