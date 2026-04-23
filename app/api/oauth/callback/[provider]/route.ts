import { NextResponse } from "next/server";
import { loadConfig } from "@/config";
import { generateAuthCode } from "@/security/auth-code";
import {
  stateCookieName,
  stateCookieOptions,
  verifyState,
} from "@/security/providers/state";
import { resolveIdentity as resolveMicrosoft } from "@/security/providers/microsoft";
import { resolveIdentity as resolveGoogle } from "@/security/providers/google";
import { renderError } from "@/http/html";

function clearStateCookie(res: NextResponse) {
  res.headers.append(
    "Set-Cookie",
    `${stateCookieName()}=; ${stateCookieOptions()}; Max-Age=0`
  );
  return res;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> }
) {
  const config = loadConfig();
  const { provider } = await ctx.params;
  const url = new URL(req.url);

  if (provider !== "microsoft" && provider !== "google") {
    return renderError("Unknown provider.");
  }

  const error = url.searchParams.get("error");
  if (error) {
    return renderError(`Provider returned an error: ${error}`);
  }

  const code = url.searchParams.get("code") || "";
  const returnedState = url.searchParams.get("state") || "";
  if (!code) return renderError("Missing authorization code.");

  const cookieHeader = req.headers.get("cookie") || "";
  const cookieValue = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${stateCookieName()}=`))
    ?.split("=")
    .slice(1)
    .join("=");
  if (!cookieValue) return renderError("Sign-in session expired. Please try again.");

  const state = verifyState(cookieValue, config.oauthJwtSecret);
  if (!state) return renderError("Sign-in session invalid. Please try again.");
  if (state.provider !== provider) return renderError("Provider mismatch.");
  if (state.upstreamState !== returnedState) return renderError("State mismatch.");

  const callbackUri = `${config.publicUrl}/api/oauth/callback/${provider}`;

  const identity =
    provider === "microsoft"
      ? await resolveMicrosoft(config.microsoft!, code, callbackUri, state.upstreamVerifier)
      : await resolveGoogle(config.google!, code, callbackUri, state.upstreamVerifier);

  if ("error" in identity) {
    return clearStateCookie(renderError(friendlyError(identity.error), 403));
  }

  const authCode = generateAuthCode(
    {
      clientId: config.oauthClientId,
      redirectUri: state.claudeRedirectUri,
      codeChallenge: state.claudeCodeChallenge || undefined,
      codeChallengeMethod: state.claudeCodeChallengeMethod || undefined,
      email: identity.email,
      profile: identity.profile,
    },
    config.oauthJwtSecret
  );

  const redirectUrl = new URL(state.claudeRedirectUri);
  redirectUrl.searchParams.set("code", authCode);
  if (state.claudeState) redirectUrl.searchParams.set("state", state.claudeState);

  return clearStateCookie(NextResponse.redirect(redirectUrl.toString(), 302));
}

function friendlyError(code: string): string {
  switch (code) {
    case "user_not_in_allowed_group":
      return "Your account is not in an allowed group. Contact the MCP administrator.";
    case "email_not_in_allowlist":
      return "Your email is not on the allowlist. Contact the MCP administrator.";
    case "email_not_verified":
      return "Your email is not verified with the provider.";
    case "no_email_claim":
      return "The provider did not return an email address.";
    default:
      return `Sign-in failed (${code}).`;
  }
}
