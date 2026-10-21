/** What a user may see: every parking (SUPER) or the ones assigned to it. */
export interface ProjectAccess {
  all: boolean;
  allowed: string[];
}

export const canAccessProject = (access: ProjectAccess, projectId: unknown): boolean => {
  if (access.all) return true;
  const id = String(projectId ?? "").trim();
  return Boolean(id) && access.allowed.includes(id);
};
