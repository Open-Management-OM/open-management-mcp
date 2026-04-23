import { NextResponse } from "next/server";
import { loadConfig } from "@/config";
import { renderError } from "@/http/html";
import {
  readCookie,
  stepCookieName,
  verifyStep,
} from "@/security/custom-state";
import {
  renderMfaChallenge,
  type ClaudeParams,
} from "@/security/providers/custom-html";
import {
  consumeBackupCode,
  validateCode,
} from "@/security/totp";
import {
  createStore,
  getUserByEmail,
  updateBackupCodes,
} from "@/security/custom-users";
import { finalizeWithAuthCode } from "@/security/custom-finalize";

function claudeParamsFromCookie(state: NonNullable<ReturnType<typeof verifyStep>>): ClaudeParams {
  return {
    clientId: state.claudeClientId,
    redirectUri: state.claudeRedirectUri,
    state: state.claudeState,
    codeChallenge: state.claudeCodeChallenge,
    codeChallengeMethod: state.claudeCodeChallengeMethod,
  };
}

export async function GET(req: Request) {
  const config = loadConfig();
  if (!config.custom) return renderError("Custom auth is not configured.", 500);

  const cookieHeader = req.headers.get("cookie") || "";
  const cookieValue = readCookie(cookieHeader, stepCookieName());
  if (!cookieValue) return renderError("Your session expired. Please sign in again.");
  const state = verifyStep(cookieValue, config.oauthJwtSecret);
  if (!state || state.step !== "mfa_challenge") {
    return renderError("Invalid challenge session. Please sign in again.");
  }

  return renderMfaChallenge(claudeParamsFromCookie(state));
}

export async function POST(req: Request) {
  const config = loadConfig();
  if (!config.custom) return renderError("Custom auth is not configured.", 500);

  const cookieHeader = req.headers.get("cookie") || "";
  const cookieValue = readCookie(cookieHeader, stepCookieName());
  if (!cookieValue) return renderError("Your session expired. Please sign in again.");
  const state = verifyStep(cookieValue, config.oauthJwtSecret);
  if (!state || state.step !== "mfa_challenge") {
    return renderError("Invalid challenge session. Please sign in again.");
  }

  const form = await req.formData();
  const mode = (form.get("mode") as string | null) || "verify";
  const code = ((form.get("code") as string) || "").trim();
  const p = claudeParamsFromCookie(state);

  if (!code) {
    return renderMfaChallenge(p, "Enter your 6-digit code or a backup code.");
  }

  const store = createStore(config.databaseUrl, config.custom.encryptionKey);
  const user = await getUserByEmail(store, state.email);
  if (!user || !user.mfaEnrolled || !user.mfaSecret) {
    return renderError("Account is not enrolled in 2FA. Contact your MCP administrator.");
  }

  if (mode === "backup") {
    const { matched, remaining } = consumeBackupCode(code, user.mfaBackupCodeHashes);
    if (!matched) {
      return renderMfaChallenge(p, "That backup code didn't match.");
    }
    await updateBackupCodes(store, user.email, remaining);
    return finalizeWithAuthCode(user.email, user.profile, p, config.oauthJwtSecret, config.oauthClientId);
  }

  if (!(await validateCode(code, user.mfaSecret))) {
    return renderMfaChallenge(p, "That code didn't match. Try again.");
  }

  return finalizeWithAuthCode(user.email, user.profile, p, config.oauthJwtSecret, config.oauthClientId);
}

export const dynamic = "force-dynamic";
