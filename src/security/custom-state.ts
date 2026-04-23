import { createHmac, timingSafeEqual } from "crypto";

export type CustomStep = "mfa_challenge" | "mfa_enroll";

export interface CustomStepState {
  step: CustomStep;
  email: string;
  claudeClientId: string;
  claudeRedirectUri: string;
  claudeState: string;
  claudeCodeChallenge: string;
  claudeCodeChallengeMethod: string;
  pendingSecret?: string;
  exp: number;
}

const COOKIE_NAME = "mcp_custom_step";
const TTL_MS = 10 * 60 * 1000;

export function signStep(state: Omit<CustomStepState, "exp">, secret: string): string {
  const payload: CustomStepState = { ...state, exp: Date.now() + TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyStep(value: string, secret: string): CustomStepState | null {
  try {
    const dotIndex = value.lastIndexOf(".");
    if (dotIndex === -1) return null;
    const encoded = value.slice(0, dotIndex);
    const sig = value.slice(dotIndex + 1);
    const expectedSig = createHmac("sha256", secret).update(encoded).digest("base64url");
    if (!safeEq(sig, expectedSig)) return null;
    const payload: CustomStepState = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function stepCookieName(): string {
  return COOKIE_NAME;
}

export function stepCookieOptions(): string {
  return `Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_MS / 1000}`;
}

export function stepCookieClearOptions(): string {
  return `Path=/api/oauth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function readCookie(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) return null;
  const entry = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`));
  if (!entry) return null;
  return entry.slice(name.length + 1);
}
