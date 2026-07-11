export const AUTH_ROLES = {
    SUPER: "SUPER_ROLE",
    ADMIN: "ADMIN_ROLE",
    PENSION: "PENSION_ROLE",
    CLIENT: "CLIENT_ROLE",
} as const;

export const AUTH_ROLE_VALUES = Object.values(AUTH_ROLES);

export type UsuarioRol = (typeof AUTH_ROLES)[keyof typeof AUTH_ROLES];

export const isUsuarioRol = (value: unknown): value is UsuarioRol =>
    typeof value === "string" && AUTH_ROLE_VALUES.includes(value as UsuarioRol);
