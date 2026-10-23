export type ConnectionStatus = "online" | "offline" | "pending";
export type ConnectionSubject = "instalacion" | "modulo";

export interface ConnectionEventRecord {
  id: string;
  proyectoId: string;
  proyectoNombre: string;
  installationId: string;
  /** Null: the event is about the installation itself. */
  moduloId: string | null;
  moduloNombre: string | null;
  moduloIdentificador: string | null;
  fromStatus: ConnectionStatus;
  toStatus: ConnectionStatus;
  occurredAt: number;
}

export interface ConnectionHistoryFilters {
  /** Null: every parking (super user). */
  projectIds: string[] | null;
  proyectoId?: string;
  moduloId?: string;
  sujeto?: ConnectionSubject;
  /** Events within [desde, hasta). */
  desde: number;
  hasta: number;
}

/** How often and how long an installation or a module was offline within a period. */
export interface ConnectionDowntime {
  proyectoId: string;
  proyectoNombre: string;
  moduloId: string | null;
  moduloNombre: string | null;
  moduloIdentificador: string | null;
  caidas: number;
  minutosSinConexion: number;
}

export interface InstallationChangeInput {
  proyectoId: string;
  installationId: string;
  fromStatus: ConnectionStatus;
  toStatus: ConnectionStatus;
  occurredAt: number;
}

export abstract class ConnectionHistoryDatasource {
  abstract recordInstallationChange(input: InstallationChangeInput): Promise<void>;
  abstract list(filters: ConnectionHistoryFilters, page: { page: number; limit: number }): Promise<{ total: number; events: ConnectionEventRecord[] }>;
  /** Offline time is counted up to `until` (now, for a period that has not ended). */
  abstract downtime(filters: ConnectionHistoryFilters, until: number): Promise<ConnectionDowntime[]>;
}
