import { createHmac, randomBytes } from "crypto";

export interface SsoState {
  provider: "microsoft" | "google";
  claudeRedirectUri: string;
  claudeState: string;
  claudeCodeChallenge: string;
  claudeCodeChallengeMethod: string;
  upstreamState: string;
  upstreamVerifier: string;
  exp: number;
}

const COOKIE_NAME = "mcp_sso_state";
const TTL_MS = 10 * 60 * 1000;

export function generateVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function generateState(): string {
  return randomBytes(16).toString("base64url");
}

export function signState(state: Omit<SsoState, "exp">, secret: string): string {
  const payload: SsoState = { ...state, exp: Date.now() + TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyState(value: string, secret: string): SsoState | null {
  try {
    const dotIndex = value.lastIndexOf(".");
    if (dotIndex === -1) return null;
    const encoded = value.slice(0, dotIndex);
    const sig = value.slice(dotIndex + 1);
    const expectedSig = createHmac("sha256", secret).update(encoded).digest("base64url");
    if (sig !== expectedSig) return null;
    const payload: SsoState = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function stateCookieName(): string {
  return COOKIE_NAME;
}

export function stateCookieOptions(): string {
  return `Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_MS / 1000}`;
}
