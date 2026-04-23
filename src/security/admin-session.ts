import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "mcp_admin_session";
const TTL_MS = 60 * 60 * 1000;

export interface AdminSession {
  admin: true;
  exp: number;
}

export function signSession(secret: string): string {
  const payload: AdminSession = { admin: true, exp: Date.now() + TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySession(value: string, secret: string): AdminSession | null {
  try {
    const dot = value.lastIndexOf(".");
    if (dot === -1) return null;
    const encoded = value.slice(0, dot);
    const sig = value.slice(dot + 1);
    const expectedSig = createHmac("sha256", secret).update(encoded).digest("base64url");
    if (sig.length !== expectedSig.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    const payload: AdminSession = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (!payload.admin || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieName(): string {
  return COOKIE_NAME;
}

export function sessionCookieSetHeader(value: string): string {
  return `${COOKIE_NAME}=${value}; Path=/api/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_MS / 1000}`;
}

export function sessionCookieClearHeader(): string {
  return `${COOKIE_NAME}=; Path=/api/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readAdminCookie(cookieHeader: string): string | null {
  if (!cookieHeader) return null;
  const entry = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE_NAME}=`));
  if (!entry) return null;
  return entry.slice(COOKIE_NAME.length + 1);
}

export function tokensEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
