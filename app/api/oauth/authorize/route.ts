import { NextResponse } from "next/server";
import { loadConfig } from "@/config";
import {
  generateState,
  generateVerifier,
  signState,
  stateCookieName,
  stateCookieOptions,
} from "@/security/providers/state";
import { buildAuthorizeUrl as buildMicrosoftUrl } from "@/security/providers/microsoft";
import { buildAuthorizeUrl as buildGoogleUrl } from "@/security/providers/google";
import { renderError } from "@/http/html";
import {
  renderLogin,
  renderLocked,
  type ClaudeParams,
} from "@/security/providers/custom-html";
import {
  createStore,
  getUserByEmail,
  recordFailedLogin,
  resetFailedLogins,
  verifyPassword,
} from "@/security/custom-users";
import {
  signStep,
  stepCookieName,
  stepCookieOptions,
} from "@/security/custom-state";

type ProviderName = "microsoft" | "google" | "custom";

function availableProviders(config: ReturnType<typeof loadConfig>): ProviderName[] {
  const list: ProviderName[] = [];
  if (config.microsoft) list.push("microsoft");
  if (config.google) list.push("google");
  if (config.custom) list.push("custom");
  return list;
}

function renderPicker(claudeParams: Record<string, string>, providers: ProviderName[]) {
  const labels: Record<ProviderName, string> = {
    microsoft: "Sign in with Microsoft",
    google: "Sign in with Google",
    custom: "Sign in with your team account",
  };
  const classes: Record<ProviderName, string> = {
    microsoft: "btn microsoft",
    google: "btn google",
    custom: "btn custom",
  };
  const buttons = providers
    .map((p) => {
      const params = new URLSearchParams({ ...claudeParams, provider: p });
      return `<a class="${classes[p]}" href="/api/oauth/authorize?${params.toString()}">${labels[p]}</a>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Authorize MCP access</title><style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5}.card{background:#171717;border:1px solid #262626;border-radius:12px;padding:32px;max-width:400px;width:100%}h1{font-size:20px;margin:0 0 8px}p{color:#a3a3a3;font-size:14px;margin:0 0 24px}.btn{display:block;padding:12px;border-radius:8px;text-align:center;text-decoration:none;font-size:15px;font-weight:600;margin-bottom:10px}.btn.microsoft{background:#2f2f2f;color:#fff;border:1px solid #3d3d3d}.btn.microsoft:hover{background:#3a3a3a}.btn.google{background:#fff;color:#1f1f1f}.btn.google:hover{background:#f1f1f1}.btn.custom{background:transparent;color:#e5e5e5;border:1px solid #3d3d3d}.btn.custom:hover{background:#1f1f1f}</style></head><body><div class="card"><h1>Authorize MCP access</h1><p>Sign in to authorize this connector.</p>${buttons}</div></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}

function claudeParamsFrom(record: Record<string, string>): ClaudeParams {
  return {
    clientId: record.client_id || "",
    redirectUri: record.redirect_uri || "",
    state: record.state || "",
    codeChallenge: record.code_challenge || "",
    codeChallengeMethod: record.code_challenge_method || "",
  };
}

function validateClaudeParams(config: ReturnType<typeof loadConfig>, p: ClaudeParams): Response | null {
  if (!p.clientId || !p.redirectUri) return renderError("Missing client_id or redirect_uri.");
  if (p.clientId !== config.oauthClientId) return renderError("Unknown client.");
  return null;
}

export async function GET(req: Request) {
  const config = loadConfig();
  const url = new URL(req.url);

  const p = claudeParamsFrom({
    client_id: url.searchParams.get("client_id") || "",
    redirect_uri: url.searchParams.get("redirect_uri") || "",
    state: url.searchParams.get("state") || "",
    code_challenge: url.searchParams.get("code_challenge") || "",
    code_challenge_method: url.searchParams.get("code_challenge_method") || "",
  });
  const provider = url.searchParams.get("provider") as ProviderName | null;

  const invalid = validateClaudeParams(config, p);
  if (invalid) return invalid;

  const available = availableProviders(config);
  if (available.length === 0) {
    return renderError(
      "No sign-in method is configured. Set MICROSOFT_*, GOOGLE_*, or CUSTOM_AUTH_* env vars.",
      500,
    );
  }

  if (!provider) {
    if (available.length === 1) {
      if (available[0] === "custom") {
        return renderLogin(p);
      }
      const next = new URL(req.url);
      next.searchParams.set("provider", available[0]);
      return NextResponse.redirect(next.toString(), 302);
    }
    return renderPicker(
      {
        client_id: p.clientId,
        redirect_uri: p.redirectUri,
        state: p.state,
        code_challenge: p.codeChallenge,
        code_challenge_method: p.codeChallengeMethod,
      },
      available,
    );
  }

  if (!available.includes(provider)) {
    return renderError(`Provider "${provider}" is not configured.`);
  }

  if (provider === "custom") {
    return renderLogin(p);
  }

  // SSO provider flow (microsoft or google)
  const upstreamState = generateState();
  const upstreamVerifier = generateVerifier();
  const callbackUri = `${config.publicUrl}/api/oauth/callback/${provider}`;

  const authorizeUrl =
    provider === "microsoft"
      ? buildMicrosoftUrl(config.microsoft!, callbackUri, upstreamState, upstreamVerifier)
      : buildGoogleUrl(config.google!, callbackUri, upstreamState, upstreamVerifier);

  const stateCookie = signState(
    {
      provider,
      claudeRedirectUri: p.redirectUri,
      claudeState: p.state,
      claudeCodeChallenge: p.codeChallenge,
      claudeCodeChallengeMethod: p.codeChallengeMethod,
      upstreamState,
      upstreamVerifier,
    },
    config.oauthJwtSecret,
  );

  const response = NextResponse.redirect(authorizeUrl, 302);
  response.headers.append("Set-Cookie", `${stateCookieName()}=${stateCookie}; ${stateCookieOptions()}`);
  return response;
}

export async function POST(req: Request) {
  const config = loadConfig();
  if (!config.custom) return renderError("Custom auth is not configured.", 500);

  const form = await req.formData();
  const provider = (form.get("provider") as string | null) || "";
  if (provider !== "custom") return renderError("Unknown provider.");

  const p = claudeParamsFrom({
    client_id: (form.get("client_id") as string) || "",
    redirect_uri: (form.get("redirect_uri") as string) || "",
    state: (form.get("state") as string) || "",
    code_challenge: (form.get("code_challenge") as string) || "",
    code_challenge_method: (form.get("code_challenge_method") as string) || "",
  });
  const invalid = validateClaudeParams(config, p);
  if (invalid) return invalid;

  const email = ((form.get("email") as string) || "").trim().toLowerCase();
  const password = ((form.get("password") as string) || "");
  if (!email || !password) return renderLogin(p, "Email and password are required.");

  const store = createStore(config.databaseUrl, config.custom.encryptionKey);
  const user = await getUserByEmail(store, email);
  if (!user) {
    return renderLogin(p, "Invalid email or password.", email);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return renderLocked(p);
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const { locked } = await recordFailedLogin(store, email);
    if (locked) return renderLocked(p);
    return renderLogin(p, "Invalid email or password.", email);
  }

  await resetFailedLogins(store, email);

  const step = user.mfaEnrolled ? "mfa_challenge" : "mfa_enroll";
  const cookie = signStep(
    {
      step,
      email: user.email,
      claudeClientId: p.clientId,
      claudeRedirectUri: p.redirectUri,
      claudeState: p.state,
      claudeCodeChallenge: p.codeChallenge,
      claudeCodeChallengeMethod: p.codeChallengeMethod,
    },
    config.oauthJwtSecret,
  );

  const redirectTarget = user.mfaEnrolled
    ? `/api/oauth/mfa?${new URLSearchParams({
        client_id: p.clientId,
        redirect_uri: p.redirectUri,
        state: p.state,
        code_challenge: p.codeChallenge,
        code_challenge_method: p.codeChallengeMethod,
      }).toString()}`
    : `/api/oauth/enroll?${new URLSearchParams({
        client_id: p.clientId,
        redirect_uri: p.redirectUri,
        state: p.state,
        code_challenge: p.codeChallenge,
        code_challenge_method: p.codeChallengeMethod,
      }).toString()}`;

  const res = NextResponse.redirect(new URL(redirectTarget, config.publicUrl || req.url).toString(), 302);
  res.headers.append("Set-Cookie", `${stepCookieName()}=${cookie}; ${stepCookieOptions()}`);
  // Clear any stale SSO state cookie from a prior attempt
  res.headers.append("Set-Cookie", `${stateCookieName()}=; ${stateCookieOptions()}; Max-Age=0`);
  return res;
}

export const dynamic = "force-dynamic";
