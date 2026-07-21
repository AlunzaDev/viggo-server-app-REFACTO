export const normalizeUserParkings = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

  return Array.from(new Set(normalized));
};
