import { randomUUID } from "node:crypto";
import { PostgresDatabase } from "../../../data/postgres";
import {
  TicketLabDatasource,
  type TicketLabProject,
  type TicketLabTicketOperation,
} from "../../../domain/datasources/dev/ticket-lab.datasource";
import type { Prisma } from "../../../generated/prisma/client";

const projectInclude = { paymentProviderRelation: true } satisfies Prisma.ProyectoInclude;
type ProjectRow = Prisma.ProyectoGetPayload<{ include: typeof projectInclude }>;

const toProject = (row: ProjectRow): TicketLabProject => ({
  id: row.id,
  nombre: row.nombre,
  ciudad: row.ciudad ?? "",
  coordinates: row.coordinates,
  estado: row.estado,
  paymentProviderId: row.paymentProviderId ?? "",
  paymentProviderName: row.paymentProviderRelation?.nombre ?? "Sin proveedor",
});

const toUser = (row: { id: string; nombre: string; apellido: string; correo: string }) => ({
  id: row.id,
  nombre: `${row.nombre} ${row.apellido}`.trim(),
  correo: row.correo,
});

const moduleSelect = { id: true, nombre: true, tipo: true, proyectoId: true } satisfies Prisma.ModuloSelect;

export class TicketLabPostgresDatasource extends TicketLabDatasource {
  private get db() {
    return PostgresDatabase.client;
  }

  async activeUsers() {
    return (await this.db.usuario.findMany({ where: { estado: true }, orderBy: { correo: "asc" } })).map(toUser);
  }

  activeModules() {
    return this.db.modulo.findMany({ where: { estado: true }, orderBy: { nombre: "asc" }, select: moduleSelect });
  }

  async projects() {
    return (await this.db.proyecto.findMany({ include: projectInclude })).map(toProject);
  }

  async approvedInstallations() {
    const rows = await this.db.localInstallation.findMany({ where: { status: "approved" }, orderBy: { createdAt: "asc" } });
    return rows.map((row) => ({ installationId: row.installationId, proyectoId: row.proyectoId, lastCommandPollAt: row.lastCommandPollAt?.getTime() ?? null }));
  }

  async recentPayments(userId: string, limit: number) {
    const rows = await this.db.payment.findMany({ where: { usuarioId: userId }, orderBy: { paidAt: "desc" }, take: limit });
    return rows.map((row) => ({
      id: row.id, concept: row.concept, amount: Number(row.amount), currency: row.currency, status: row.status, paidAt: row.paidAt.getTime(),
      parkingName: row.parkingName, parkingCity: row.parkingCity, referenceId: row.referenceId, reconciliationStatus: row.reconciliationStatus,
    }));
  }

  async findUser(id: string) {
    const row = await this.db.usuario.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }

  findModule(id: string) {
    return this.db.modulo.findUnique({ where: { id }, select: moduleSelect });
  }

  async findProject(id: string) {
    const row = await this.db.proyecto.findUnique({ where: { id }, include: projectInclude });
    return row ? toProject(row) : null;
  }

  async createTicketOperation(operation: TicketLabTicketOperation) {
    await this.db.mobileOperation.create({
      data: {
        operationId: randomUUID(),
        idempotencyKey: `dev-ticket-lab:${randomUUID()}`,
        type: "CREATE_TICKET",
        installationId: operation.installationId,
        proyectoId: operation.proyectoId,
        usuarioId: operation.usuarioId,
        payload: { source: "ticket-lab", moduleId: operation.moduleId, devInstallationBridge: operation.devInstallationBridge },
        result: { ticket: operation.ticket } as Prisma.InputJsonValue,
        ticketId: operation.ticketId,
        status: "completed",
        attempts: 1,
        maxAttempts: 1,
        completedAt: new Date(operation.completedAt),
      },
    });
  }
}
