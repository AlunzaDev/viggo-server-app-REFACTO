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
export * from "./auth/usuario.repository";
export * from "./cash-register/cash-register-shift.repository";
export * from "./cash-register/cash-register-movement.repository";
export * from "./cash-register/cash-register-count.repository";
export * from "./cash-register/cash-register-cut.repository";
export * from "./payments/payment.repository";
export * from "./payments/cash-payment-session.repository";
