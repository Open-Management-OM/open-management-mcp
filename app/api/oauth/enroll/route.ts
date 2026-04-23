import { NextResponse } from "next/server";
import { loadConfig } from "@/config";
import { renderError } from "@/http/html";
import {
  readCookie,
  signStep,
  stepCookieName,
  stepCookieOptions,
  verifyStep,
} from "@/security/custom-state";
import {
  renderEnrollQr,
  renderBackupCodes,
  type ClaudeParams,
} from "@/security/providers/custom-html";
import {
  enroll as enrollTotp,
  generateBackupCodes,
  hashBackupCode,
  renderQrSvg,
  validateCode,
} from "@/security/totp";
import {
  completeMfaEnrollment,
  createStore,
  getUserByEmail,
} from "@/security/custom-users";
import { finalizeWithAuthCode } from "@/security/custom-finalize";

function claudeParamsFromCookie(state: ReturnType<typeof verifyStep>): ClaudeParams {
  return {
    clientId: state!.claudeClientId,
    redirectUri: state!.claudeRedirectUri,
    state: state!.claudeState,
    codeChallenge: state!.claudeCodeChallenge,
    codeChallengeMethod: state!.claudeCodeChallengeMethod,
  };
}

async function reSignWithSecret(
  state: NonNullable<ReturnType<typeof verifyStep>>,
  secret: string,
  jwtSecret: string,
): Promise<string> {
  return signStep(
    {
      step: "mfa_enroll",
      email: state.email,
      claudeClientId: state.claudeClientId,
      claudeRedirectUri: state.claudeRedirectUri,
      claudeState: state.claudeState,
      claudeCodeChallenge: state.claudeCodeChallenge,
      claudeCodeChallengeMethod: state.claudeCodeChallengeMethod,
      pendingSecret: secret,
    },
    jwtSecret,
  );
}

export async function GET(req: Request) {
  const config = loadConfig();
  if (!config.custom) return renderError("Custom auth is not configured.", 500);

  const cookieHeader = req.headers.get("cookie") || "";
  const cookieValue = readCookie(cookieHeader, stepCookieName());
  if (!cookieValue) return renderError("Your session expired. Please sign in again.");
  const state = verifyStep(cookieValue, config.oauthJwtSecret);
  if (!state || state.step !== "mfa_enroll") {
    return renderError("Invalid enrollment session. Please sign in again.");
  }

  const { secret, otpauthUri } = enrollTotp(state.email, config.custom.issuer);
  const qrSvg = await renderQrSvg(otpauthUri);

  const p = claudeParamsFromCookie(state);
  const html = renderEnrollQr(p, secret, qrSvg);
  const res = new NextResponse(html.body, html);
  res.headers.append(
    "Set-Cookie",
    `${stepCookieName()}=${await reSignWithSecret(state, secret, config.oauthJwtSecret)}; ${stepCookieOptions()}`,
  );
  return res;
}

export async function POST(req: Request) {
  const config = loadConfig();
  if (!config.custom) return renderError("Custom auth is not configured.", 500);

  const cookieHeader = req.headers.get("cookie") || "";
  const cookieValue = readCookie(cookieHeader, stepCookieName());
  if (!cookieValue) return renderError("Your session expired. Please sign in again.");
  const state = verifyStep(cookieValue, config.oauthJwtSecret);
  if (!state || state.step !== "mfa_enroll") {
    return renderError("Invalid enrollment session. Please sign in again.");
  }

  const form = await req.formData();
  const mode = (form.get("mode") as string | null) || "verify";
  const p = claudeParamsFromCookie(state);

  if (mode === "verify") {
    if (!state.pendingSecret) {
      return renderError("Enrollment session is missing pending secret. Start over.");
    }
    const code = ((form.get("code") as string) || "").trim();
    if (!(await validateCode(code, state.pendingSecret))) {
      const qrSvg = await renderQrSvg(
        enrollTotpUriForRedraw(state.email, config.custom.issuer, state.pendingSecret),
      );
      return renderEnrollQr(p, state.pendingSecret, qrSvg, "That code didn't match. Try again-- make sure your device clock is accurate.");
    }

    const store = createStore(config.databaseUrl, config.custom.encryptionKey);
    const backupCodes = generateBackupCodes(10);
    const hashes = backupCodes.map(hashBackupCode);
    await completeMfaEnrollment(store, state.email, state.pendingSecret, hashes);

    // Carry only the claude params + email into the final step; drop pendingSecret.
    const finalizeCookie = signStep(
      {
        step: "mfa_enroll",
        email: state.email,
        claudeClientId: state.claudeClientId,
        claudeRedirectUri: state.claudeRedirectUri,
        claudeState: state.claudeState,
        claudeCodeChallenge: state.claudeCodeChallenge,
        claudeCodeChallengeMethod: state.claudeCodeChallengeMethod,
      },
      config.oauthJwtSecret,
    );
    const html = renderBackupCodes(p, backupCodes);
    const res = new NextResponse(html.body, html);
    res.headers.append("Set-Cookie", `${stepCookieName()}=${finalizeCookie}; ${stepCookieOptions()}`);
    return res;
  }

  if (mode === "finalize") {
    const store = createStore(config.databaseUrl, config.custom.encryptionKey);
    const user = await getUserByEmail(store, state.email);
    if (!user) return renderError("User not found. Contact your MCP administrator.");
    return finalizeWithAuthCode(user.email, user.profile, p, config.oauthJwtSecret, config.oauthClientId);
  }

  return renderError("Unknown enrollment action.");
}

function enrollTotpUriForRedraw(email: string, issuer: string, secret: string): string {
  // Rebuild the otpauth:// URI for the SAME secret (not a new enrollment).
  const enc = encodeURIComponent;
  return `otpauth://totp/${enc(issuer)}:${enc(email)}?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export const dynamic = "force-dynamic";
