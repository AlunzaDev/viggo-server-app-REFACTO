import fs from "node:fs";
import path from "node:path";

const PROJECT_UPLOADS_PREFIX = "/uploads/projects/";

const resolveManagedProjectImagePath = (imageUrl: string): string | null => {
  const normalized = imageUrl.trim();
  if (!normalized.startsWith(PROJECT_UPLOADS_PREFIX)) return null;

  return path.join(process.cwd(), "public", normalized.replace(/^\/+/, ""));
};

export const buildProjectImageUrl = (filename: string): string => {
  return `${PROJECT_UPLOADS_PREFIX}${filename}`;
};

export const deleteManagedProjectImage = (imageUrl?: string | null) => {
  if (!imageUrl) return;

  const fullPath = resolveManagedProjectImagePath(imageUrl);
  if (!fullPath || !fs.existsSync(fullPath)) return;

  fs.unlinkSync(fullPath);
};
