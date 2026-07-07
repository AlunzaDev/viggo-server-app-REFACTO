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
