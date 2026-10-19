import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  decryptInstallationLinkToken,
  encryptInstallationLinkToken,
} from "./installation-link-token-crypto.util";

/**
 * Label of the token ADMINISTRATIVO uses to call an installation's local API. OPERATIVO
 * derives the same value from its own sync token, so it must not change on either side.
 */
export const ADMIN_CALL_TOKEN_LABEL = "viggo:administrativo->operativo";

export const hashSyncToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/** HMAC of the label keyed by the sync token: knowing it does not reveal the sync token. */
export const deriveAdminCallToken = (syncToken: string): string =>
  createHmac("sha256", syncToken).update(ADMIN_CALL_TOKEN_LABEL).digest("base64url");

/**
 * A fresh sync token for an installation. Only its hash is stored, plus the derived token
 * (encrypted) that ADMINISTRATIVO needs to call the installation.
 */
export const issueSyncToken = () => {
  const syncToken = randomBytes(32).toString("base64url");
  return {
    syncToken,
    syncTokenHash: hashSyncToken(syncToken),
    adminCallTokenEncrypted: encryptInstallationLinkToken(deriveAdminCallToken(syncToken)),
  };
};

export const readAdminCallToken = (encrypted: string | null | undefined): string =>
  decryptInstallationLinkToken(encrypted);
