import fs from "node:fs";
import path from "node:path";

const USER_UPLOADS_PREFIX = "/uploads/users/";

const resolveManagedUserImagePath = (imageUrl: string): string | null => {
  const normalized = imageUrl.trim();
  if (!normalized.startsWith(USER_UPLOADS_PREFIX)) return null;

  return path.join(process.cwd(), "public", normalized.replace(/^\/+/, ""));
};

export const deleteManagedUserImage = (imageUrl?: string | null) => {
  if (!imageUrl) return;

  const fullPath = resolveManagedUserImagePath(imageUrl);
  if (!fullPath || !fs.existsSync(fullPath)) return;

  fs.unlinkSync(fullPath);
};
