export const toLegacyDocument = <T extends { id?: string }>(entity: T) => {
  const { id, ...rest } = entity as T & Record<string, unknown>;

  if (!id) return rest;

  return {
    ...rest,
    uid: id,
  };
};
