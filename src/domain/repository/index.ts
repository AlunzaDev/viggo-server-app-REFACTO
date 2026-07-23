import type { LogEntity } from "../entities";

export interface LogRepository {
  saveLog(log: LogEntity): void | Promise<void>;
}

export * from "./parking/proyecto.repository";
export * from "./parking/modulo.repository";
export * from "./pension/pension.repository";
export * from "./pension/pension-pass.repository";
export * from "./auth/auth.repository";
export * from "./auth/permission-profile.repository";
export * from "./auth/usuario.repository";
export * from "./payments/payment.repository";
