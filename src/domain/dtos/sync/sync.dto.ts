// What an installation's OPERATIVO sends over /api/sync. The installation (and, when linking,
// the project) come from its credentials, never from the body.
import { isUserAppAccess, type UserAppAccess } from "../../constants";
import type {
  HeartbeatSnapshotPayload,
  InboxEventPayload,
  InstallationLinkRequestPayload,
} from "../../datasources/sync/sync.datasource";

type Body = Record<string, unknown>;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : undefined);

/** A row change of OPERATIVO (outbox → inbox). */
export class SyncEventDto {
  private constructor(public readonly values: Omit<InboxEventPayload, "installationId">) {}

  static create(body: Body = {}): [string?, SyncEventDto?] {
    const eventId = String(body.eventId ?? "").trim();
    const proyectoId = String(body.proyectoId ?? "").trim();
    const eventType = String(body.eventType ?? "").trim();
    const aggregateId = String(body.aggregateId ?? "").trim();
    const occurredAt = Number(body.occurredAt);
    if (!eventId || !proyectoId || !eventType || !aggregateId) return ["eventId, proyectoId, eventType y aggregateId son requeridos"];
    if (!Number.isFinite(occurredAt)) return ["occurredAt debe ser numerico"];
    if (!isObject(body.payload)) return ["payload debe ser un objeto"];
    return [undefined, new SyncEventDto({
      eventId, proyectoId, eventType, aggregateId, occurredAt,
      sourcePosition: body.sourcePosition === undefined ? undefined : String(body.sourcePosition),
      payload: body.payload,
    })];
  }
}

/** The state of the parking's devices, as OPERATIVO sees it. */
export class HeartbeatSnapshotDto {
  private constructor(public readonly values: Omit<HeartbeatSnapshotPayload, "installationId">) {}

  static create(body: Body = {}): [string?, HeartbeatSnapshotDto?] {
    const proyectoId = String(body.proyectoId ?? "").trim();
    const generatedAt = Number(body.generatedAt);
    if (!proyectoId) return ["proyectoId es requerido"];
    if (!Number.isFinite(generatedAt)) return ["generatedAt debe ser numerico"];
    if (!body.summary || typeof body.summary !== "object") return ["summary es requerido"];
    if (!Array.isArray(body.modules)) return ["modules debe ser un arreglo"];
    return [undefined, new HeartbeatSnapshotDto({
      proyectoId,
      generatedAt,
      source: String(body.source ?? "operativo-sync").trim() || "operativo-sync",
      summary: body.summary as Record<string, unknown>,
      modules: body.modules.filter(isObject),
      metadata: isObject(body.metadata) ? body.metadata : undefined,
    })];
  }
}

/** An installation asking to be linked to the project of its link token. */
export class InstallationLinkRequestDto {
  private constructor(public readonly values: Omit<InstallationLinkRequestPayload, "installationId" | "proyectoId">) {}

  static create(body: Body = {}): InstallationLinkRequestDto {
    const raw = Array.isArray(body.browserCoordinates) ? body.browserCoordinates : [];
    const longitude = Number(raw[0]), latitude = Number(raw[1]);
    return new InstallationLinkRequestDto({
      localApiBaseUrl: String(body.localApiBaseUrl ?? ""),
      serverIp: String(body.serverIp ?? ""),
      serverMac: String(body.serverMac ?? ""),
      browserCoordinates: raw.length === 2 && Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : undefined,
      browserLocationAccuracy: finite(body.browserLocationAccuracy),
      browserLocationCapturedAt: finite(body.browserLocationCapturedAt),
      requestedByUserId: String(body.requestedByUserId ?? ""),
      requestedByUserName: String(body.requestedByUserName ?? ""),
    });
  }
}

/** Looking up a user (by email or phone) and its access to one app of the parking. */
export class AccessUserLookupDto {
  private constructor(
    public readonly value: string,
    public readonly app: UserAppAccess,
  ) {}

  static create(field: "correo" | "telefono", value: unknown, app: unknown): [string?, AccessUserLookupDto?] {
    const trimmed = String(value ?? "").trim();
    const normalized = field === "correo" ? trimmed.toLowerCase() : trimmed;
    const requestedApp = String(app ?? "").trim();
    if (!normalized) return [`${field} es requerido`];
    if (!isUserAppAccess(requestedApp)) return ["app es requerida y debe ser una aplicación válida"];
    return [undefined, new AccessUserLookupDto(normalized, requestedApp)];
  }
}
