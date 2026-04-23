import { createHmac } from "crypto";

/**
 * Create an HS256-signed JWT with the given payload and expiration.
 */
export function signJwt(
  payload: Record<string, unknown>,
  secret: string,
  expiresInSeconds: number
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");

  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: now + expiresInSeconds })
  ).toString("base64url");

  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${signature}`;
}

/**
 * Verify an HS256 JWT signature and expiry. Returns the payload or null.
 */
export function verifyJwt(
  token: string,
  secret: string
): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = createHmac("sha256", secret)
      .update(`${header}.${body}`)
      .digest("base64url");
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Decode a JWT payload without verifying the signature.
 * Useful for reading claims from trusted-source tokens (e.g. IdP id_tokens).
 */
export function decodeJwtPayload(
  jwt: string
): Record<string, unknown> | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString());
  } catch {
    return null;
  }
}
