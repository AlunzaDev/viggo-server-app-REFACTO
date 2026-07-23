export interface LogEntity {
  level: "info" | "warn" | "error";
  message: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export * from "./auth/role.entity";
export * from "./auth/permission-profile.entity";
export * from "./auth/usuario.entity";
export * from "./parking/proyecto.entity";
export * from "./parking/modulo.entity";
export * from "./pension/pension.entity";
export * from "./pension/pension-pass.entity";
export * from "./payments/payment.entity";
