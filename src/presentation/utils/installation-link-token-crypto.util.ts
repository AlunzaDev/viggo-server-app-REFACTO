import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { envs } from "../../config/plugins/envs.plugin";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;

const getEncryptionKey = (): Buffer =>
  createHash("sha256")
    .update(envs.INSTALLATION_LINK_TOKEN_SECRET || envs.JWT_SEED)
    .digest();

export const encryptInstallationLinkToken = (token: string): string => {
  const iv = randomBytes(IV_BYTE_LENGTH);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString("base64url")}`;
};

export const decryptInstallationLinkToken = (
  encryptedToken: string | null | undefined,
): string => {
  const serializedValue = String(encryptedToken ?? "").trim();
  if (!serializedValue) return "";

  const [ivPart, authTagPart, cipherTextPart] = serializedValue.split(":");
  if (!ivPart || !authTagPart || !cipherTextPart) return "";

  try {
    const decipher = createDecipheriv(
      ENCRYPTION_ALGORITHM,
      getEncryptionKey(),
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(authTagPart, "base64url"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherTextPart, "base64url")),
      decipher.final(),
    ]);

    return decrypted.toString("utf8").trim();
  } catch {
    return "";
  }
};
