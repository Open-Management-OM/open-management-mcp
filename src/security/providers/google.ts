import { createHash } from "crypto";
import type { GoogleSsoConfig } from "@/types";
import { decodeJwtPayload } from "@/security/jwt";

export interface GoogleIdentity {
  email: string;
  profile: string;
}

export function buildAuthorizeUrl(
  cfg: GoogleSsoConfig,
  redirectUri: string,
  state: string,
  verifier: string
): string {
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function resolveIdentity(
  cfg: GoogleSsoConfig,
  code: string,
  redirectUri: string,
  verifier: string
): Promise<GoogleIdentity | { error: string }> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) return { error: `token_exchange_failed: ${tokenRes.status}` };
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) return { error: "missing_id_token" };

  const claims = decodeJwtPayload(tokens.id_token);
  const email = (claims?.email as string)?.toLowerCase() || "";
  const verified = claims?.email_verified === true;
  if (!email) return { error: "no_email_claim" };
  if (!verified) return { error: "email_not_verified" };

  const profile = cfg.emailProfiles[email];
  if (!profile) return { error: "email_not_in_allowlist" };

  return { email, profile };
}

