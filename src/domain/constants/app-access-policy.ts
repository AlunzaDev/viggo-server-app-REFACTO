import { AUTH_ROLES, type UsuarioRol } from "./auth-roles";
import { USER_APPS, type UserAppAccess } from "./user-apps";

const WEB_ROLES = new Set<UsuarioRol>([AUTH_ROLES.ADMIN, AUTH_ROLES.SUPER]);

export const isRoleAllowedForApp = (
  role: UsuarioRol,
  app: UserAppAccess,
): boolean => {
  if (app === USER_APPS.OPERATIVE_MOBILE) return true;
  return WEB_ROLES.has(role);
};
