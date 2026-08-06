export const USER_APPS = {
  ADMIN_WEB: "ADMIN_WEB",
  OPERATIVE_WEB: "OPERATIVE_WEB",
  OPERATIVE_MOBILE: "OPERATIVE_MOBILE",
} as const;

export type UserAppAccess = (typeof USER_APPS)[keyof typeof USER_APPS];

export const USER_APP_VALUES = Object.values(USER_APPS);

export const isUserAppAccess = (value: unknown): value is UserAppAccess => {
  return (
    typeof value === "string" &&
    USER_APP_VALUES.includes(value as UserAppAccess)
  );
};

export const normalizeUserApps = (value: unknown): UserAppAccess[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter(isUserAppAccess)));
};
