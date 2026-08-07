import { USER_APPS, type UserAppAccess } from "./user-apps";

export const AVAILABLE_USER_MODULES = [
  "cashPayments",
  "users",
  "permissionProfiles",
  "installations",
  "projects",
  "modules",
  "pensions",
  "pensionPasses",
  "tickets",
  "pensionMoves",
  "payments",
] as const;

export type UserModuleAccess = (typeof AVAILABLE_USER_MODULES)[number];

export const ADMIN_WEB_MODULES = [
  "users",
  "permissionProfiles",
  "installations",
  "projects",
  "modules",
  "pensions",
  "pensionPasses",
  "payments",
] as const satisfies readonly UserModuleAccess[];

export const OPERATIVE_WEB_MODULES = [
  "cashPayments",
  "modules",
  "pensions",
  "pensionPasses",
  "tickets",
  "pensionMoves",
  "payments",
] as const satisfies readonly UserModuleAccess[];

export const OPERATIVE_MOBILE_MODULES = [
  "cashPayments",
  "modules",
  "pensions",
  "pensionPasses",
  "tickets",
  "pensionMoves",
  "payments",
] as const satisfies readonly UserModuleAccess[];

export const USER_MODULES_BY_APP = {
  [USER_APPS.ADMIN_WEB]: ADMIN_WEB_MODULES,
  [USER_APPS.OPERATIVE_WEB]: OPERATIVE_WEB_MODULES,
  [USER_APPS.OPERATIVE_MOBILE]: OPERATIVE_MOBILE_MODULES,
} as const satisfies Record<UserAppAccess, readonly UserModuleAccess[]>;

const USER_MODULE_SET = new Set<string>(AVAILABLE_USER_MODULES);

const USER_MODULE_SET_BY_APP: Record<
  UserAppAccess,
  ReadonlySet<UserModuleAccess>
> = {
  [USER_APPS.ADMIN_WEB]: new Set(ADMIN_WEB_MODULES),
  [USER_APPS.OPERATIVE_WEB]: new Set(OPERATIVE_WEB_MODULES),
  [USER_APPS.OPERATIVE_MOBILE]: new Set(OPERATIVE_MOBILE_MODULES),
};

const MODULE_ALIASES: Record<string, UserModuleAccess> = {
  cashpayments: "cashPayments",
  pospayments: "cashPayments",
  users: "users",
  permissionprofiles: "permissionProfiles",
  installations: "installations",
  projects: "projects",
  modules: "modules",
  pensions: "pensions",
  pensionpasses: "pensionPasses",
  tickets: "tickets",
  pensionmoves: "pensionMoves",
  payments: "payments",
};

const normalizeModuleValue = (value: unknown): string => {
  const module = String(value ?? "").trim();
  return MODULE_ALIASES[module.toLowerCase()] ?? module;
};

export const getUserModulesForApp = (
  app: UserAppAccess,
): UserModuleAccess[] => [...USER_MODULES_BY_APP[app]];

export const normalizeUserModules = (value: unknown): UserModuleAccess[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(normalizeModuleValue)
        .filter((item): item is UserModuleAccess => USER_MODULE_SET.has(item)),
    ),
  );
};

export const normalizeUserModulesForApp = (
  value: unknown,
  app: UserAppAccess,
): UserModuleAccess[] => {
  const allowedModules = USER_MODULE_SET_BY_APP[app];

  return normalizeUserModules(value).filter((module) =>
    allowedModules.has(module),
  );
};

export const getInvalidUserModulesForApp = (
  value: unknown,
  app: UserAppAccess,
): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowedModules = USER_MODULE_SET_BY_APP[app];

  return Array.from(
    new Set(
      value
        .map(normalizeModuleValue)
        .filter(
          (module) =>
            !USER_MODULE_SET.has(module) ||
            !allowedModules.has(module as UserModuleAccess),
        ),
    ),
  );
};

export const getInvalidUserModules = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map(normalizeModuleValue)
        .filter((module) => !USER_MODULE_SET.has(module)),
    ),
  );
};

export const areUserModulesAllowedForApp = (
  modules: UserModuleAccess[],
  app: UserAppAccess,
): boolean => {
  const allowedModules = USER_MODULE_SET_BY_APP[app];

  return modules.every((module) => allowedModules.has(module));
};

export const hasUserModuleAccess = (
  modules: UserModuleAccess[],
  module: UserModuleAccess,
): boolean => modules.includes(module);

export const hasUserModuleAccessForApp = (
  modules: UserModuleAccess[],
  module: UserModuleAccess,
  app: UserAppAccess,
): boolean => {
  return USER_MODULE_SET_BY_APP[app].has(module) && modules.includes(module);
};
