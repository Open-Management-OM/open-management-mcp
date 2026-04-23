import { createHash, timingSafeEqual } from "crypto";
import type { AuthTokensConfig, AuthResult } from "@/types";

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export function authenticateToken(
  bearerToken: string,
  config: AuthTokensConfig
): AuthResult | null {
  if (!bearerToken) return null;
  const incomingHash = hashToken(bearerToken);
  for (const entry of config.tokens) {
    const storedHash = hashToken(entry.token);
    if (incomingHash.length === storedHash.length && timingSafeEqual(incomingHash, storedHash)) {
      return { profile: entry.profile, label: entry.label };
    }
  }
  return null;
}
