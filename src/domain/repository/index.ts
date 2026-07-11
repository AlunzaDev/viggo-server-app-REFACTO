import type { LogEntity } from "../entities";

export interface LogRepository {
    saveLog(log: LogEntity): void | Promise<void>;
}

export * from "./proveedores/proveedor.repository";
export * from "./parking/proyecto.repository";
export * from "./parking/modulo.repository";
export * from "./parking/ticket.repository";
export * from "./pension/pension.repository";
export * from "./pension/pension-pass.repository";
export * from "./pension/pension-move.repository";
export * from "./auth/auth.repository";
