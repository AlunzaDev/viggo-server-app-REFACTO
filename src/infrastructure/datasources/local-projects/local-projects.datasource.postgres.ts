import { PostgresDatabase } from "../../../data/postgres";
import type { Prisma } from "../../../generated/prisma/client";
import { isUuid } from "../postgres/prisma-errors";
import { toHeartbeatDocument } from "../sync/sync.documents.postgres";
import { LocalProjectsHttpDatasource, type LocalProjectsStore } from "./local-projects.http-datasource";

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

const postgresStore: LocalProjectsStore = {
  async findProject(projectId) {
    if (!isUuid(projectId)) return null;
    const proyecto = await PostgresDatabase.client.proyecto.findUnique({
      where: { id: projectId },
      select: { id: true, nombre: true, identificador: true, localApiBaseUrl: true },
    });
    return proyecto ? { ...proyecto, localApiBaseUrl: proyecto.localApiBaseUrl.trim() } : null;
  },
  async findHeartbeat(projectId) {
    if (!isUuid(projectId)) return null;
    const row = await PostgresDatabase.client.projectHeartbeatSnapshot.findUnique({ where: { proyectoId: projectId } });
    return row ? toHeartbeatDocument(row) : null;
  },
  async saveHeartbeat(projectId, data) {
    const fields = {
      installationId: data.installationId,
      source: data.source,
      generatedAt: new Date(data.generatedAt),
      receivedAt: new Date(data.receivedAt),
      summary: asJson(data.summary),
      modules: asJson(data.modules),
      metadata: asJson(data.metadata),
    };
    const row = await PostgresDatabase.client.projectHeartbeatSnapshot.upsert({
      where: { proyectoId: projectId },
      create: { proyectoId: projectId, ...fields },
      update: fields,
    });
    return toHeartbeatDocument(row);
  },
};

export class LocalProjectsPostgresDatasource extends LocalProjectsHttpDatasource {
  constructor() {
    super(postgresStore);
  }
}
