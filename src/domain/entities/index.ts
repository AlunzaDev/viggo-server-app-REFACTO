export interface LogEntity {
    level: "info" | "warn" | "error";
    message: string;
    createdAt: Date;
    metadata?: Record<string, unknown>;
}

export * from "./auth/role.entity";
export * from "./auth/usuario.entity";
export * from "./proveedores/proveedor.entity";
export * from "./parking/proyecto.entity";
export * from "./parking/modulo.entity";
export * from "./parking/ticket.entity";
export * from "./pension/pension.entity";
export * from "./pension/pension-pass.entity";
export * from "./pension/pension-move.entity";
export * from "./cash-register/cash-register-shift.entity";
export * from "./cash-register/cash-register-movement.entity";
export * from "./cash-register/cash-register-count.entity";
export * from "./cash-register/cash-register-cut.entity";
export * from "./payments/cash-payment-session.entity";
export * from "./payments/payment.entity";
