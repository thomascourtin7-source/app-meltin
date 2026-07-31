import { randomBytes } from "node:crypto";

/** Token URL-safe (32 octets → ~43 caractères base64url). Serveur uniquement. */
export function generateShareToken(): string {
  return randomBytes(32)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 48);
}
