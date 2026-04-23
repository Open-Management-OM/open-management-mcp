import { createHash } from "crypto";
import type { MicrosoftSsoConfig } from "@/types";
import { decodeJwtPayload } from "@/security/jwt";

export interface MicrosoftIdentity {
  email: string;
  profile: string;
  groupIds: string[];
}

export function buildAuthorizeUrl(
  cfg: MicrosoftSsoConfig,
  redirectUri: string,
  state: string,
  verifier: string
): string {
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/authorize?${params}`;
}

export async function resolveIdentity(
  cfg: MicrosoftSsoConfig,
  code: string,
  redirectUri: string,
  verifier: string
): Promise<MicrosoftIdentity | { error: string }> {
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
    {
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
    }
  );
  if (!tokenRes.ok) return { error: `token_exchange_failed: ${tokenRes.status}` };
  const tokens = (await tokenRes.json()) as {
    access_token?: string;
    id_token?: string;
  };
  if (!tokens.id_token || !tokens.access_token) return { error: "missing_tokens" };

  const claims = decodeJwtPayload(tokens.id_token);
  const email = (claims?.email as string) || (claims?.preferred_username as string) || "";
  if (!email) return { error: "no_email_claim" };

  const groupIds = await fetchGroupIds(tokens.access_token);
  const profile = pickProfile(groupIds, cfg.groupProfiles);
  if (!profile) return { error: "user_not_in_allowed_group" };

  return { email, profile, groupIds };
}


async function fetchGroupIds(accessToken: string): Promise<string[]> {
  // Graph: user's transitive group memberships (handles nested groups).
  // We cap at 100 since profile mapping is a small set; students rarely need more.
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.group?$select=id&$top=100",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { value?: Array<{ id: string }> };
  return (body.value || []).map((g) => g.id);
}

export function pickProfile(
  groupIds: string[],
  mapping: Record<string, string>
): string | null {
  // Priority order reflects the default RBAC roles in src/security/rbac.ts.
  // Custom roles from RBAC_PROFILES that aren't in this list still match --
  // they just fall to insertion order after the known roles are exhausted.
  const priority = ["admin", "lead", "finance", "member", "external", "viewer"];
  const matched = new Set<string>();
  for (const gid of groupIds) {
    const profile = mapping[gid];
    if (profile) matched.add(profile);
  }
  if (matched.size === 0) return null;
  for (const p of priority) {
    if (matched.has(p)) return p;
  }
  return matched.values().next().value as string;
}
