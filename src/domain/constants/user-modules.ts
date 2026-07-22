export const AVAILABLE_USER_MODULES = [
  "cashPayments",
  "users",
  "permissionProfiles",
  "projects",
  "modules",
  "pensions",
  "pensionPasses",
  "tickets",
  "pensionMoves",
  "payments",
] as const;

export type UserModuleAccess = (typeof AVAILABLE_USER_MODULES)[number];

const USER_MODULE_SET = new Set<string>(AVAILABLE_USER_MODULES);

const MODULE_ALIASES: Record<string, UserModuleAccess> = {
  cashpayments: "cashPayments",
  pospayments: "cashPayments",
  users: "users",
  permissionprofiles: "permissionProfiles",
  projects: "projects",
  modules: "modules",
  pensions: "pensions",
  pensionpasses: "pensionPasses",
  tickets: "tickets",
  pensionmoves: "pensionMoves",
  payments: "payments",
};

export const getDefaultUserModules = (): UserModuleAccess[] => [
  ...AVAILABLE_USER_MODULES,
];

export const normalizeUserModules = (value: unknown): UserModuleAccess[] => {
  if (!Array.isArray(value)) {
    return getDefaultUserModules();
  }

  const normalized = value
    .map((item) => String(item ?? "").trim())
    .map((item) => MODULE_ALIASES[item.toLowerCase()] ?? item)
    .filter((item): item is UserModuleAccess => USER_MODULE_SET.has(item));

  return normalized.length > 0
    ? Array.from(new Set(normalized))
    : getDefaultUserModules();
};

export const hasUserModuleAccess = (
  modules: UserModuleAccess[],
  module: UserModuleAccess,
): boolean => modules.includes(module);
