import { NextResponse } from "next/server";
import { generateAuthCode } from "@/security/auth-code";
import { stepCookieClearOptions, stepCookieName } from "@/security/custom-state";
import type { ClaudeParams } from "@/security/providers/custom-html";

export function finalizeWithAuthCode(
  email: string,
  profile: string,
  p: ClaudeParams,
  jwtSecret: string,
  oauthClientId: string,
): NextResponse {
  const authCode = generateAuthCode(
    {
      clientId: oauthClientId,
      redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge || undefined,
      codeChallengeMethod: p.codeChallengeMethod || undefined,
      email,
      profile,
    },
    jwtSecret,
  );

  const redirect = new URL(p.redirectUri);
  redirect.searchParams.set("code", authCode);
  if (p.state) redirect.searchParams.set("state", p.state);

  const res = NextResponse.redirect(redirect.toString(), 302);
  res.headers.append("Set-Cookie", `${stepCookieName()}=; ${stepCookieClearOptions()}`);
  return res;
}
