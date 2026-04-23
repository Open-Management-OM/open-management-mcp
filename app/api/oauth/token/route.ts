import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { loadConfig } from "@/config";
import { verifyAuthCode } from "@/security/auth-code";
import { signJwt, verifyJwt } from "@/security/jwt";

const ACCESS_TOKEN_TTL = 3600; // 1 hour
const REFRESH_TOKEN_TTL = 30 * 24 * 3600; // 30 days

function issueTokens(clientId: string, scope: string, secret: string) {
  const now = Math.floor(Date.now() / 1000);

  const accessToken = signJwt(
    {
      sub: clientId,
      iat: now,
      scope,
      type: "access",
    },
    secret,
    ACCESS_TOKEN_TTL
  );

  const refreshToken = signJwt(
    {
      sub: clientId,
      iat: now,
      scope,
      type: "refresh",
      jti: randomBytes(16).toString("hex"),
    },
    secret,
    REFRESH_TOKEN_TTL
  );

  return { accessToken, refreshToken };
}

export async function POST(req: Request) {
  const config = loadConfig();

  // Support both JSON and form-encoded
  const contentType = req.headers.get("content-type") || "";
  let params: Record<string, string>;

  if (contentType.includes("application/json")) {
    params = await req.json();
  } else {
    const formData = await req.formData();
    params = Object.fromEntries(
      formData.entries()
    ) as Record<string, string>;
  }

  const { grant_type, client_id, client_secret } = params;

  // Validate client credentials (required for all grant types)
  if (
    client_id !== config.oauthClientId ||
    client_secret !== config.oauthClientSecret
  ) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }

  if (grant_type === "authorization_code") {
    return handleAuthorizationCode(params, config);
  } else if (grant_type === "refresh_token") {
    return handleRefreshToken(params, config);
  } else {
    return NextResponse.json(
      { error: "unsupported_grant_type" },
      { status: 400 }
    );
  }
}

function handleAuthorizationCode(
  params: Record<string, string>,
  config: ReturnType<typeof loadConfig>
) {
  const { code, client_id, redirect_uri, code_verifier } = params;

  // Verify self-contained signed authorization code
  const codeData = verifyAuthCode(code, config.oauthJwtSecret);
  if (!codeData) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Code not found or expired" },
      { status: 400 }
    );
  }

  // Validate redirect_uri matches
  if (redirect_uri && redirect_uri !== codeData.redirectUri) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Redirect URI mismatch" },
      { status: 400 }
    );
  }

  // Validate PKCE if code_challenge was provided
  if (codeData.codeChallenge) {
    if (!code_verifier) {
      return NextResponse.json(
        { error: "invalid_grant", error_description: "Code verifier required" },
        { status: 400 }
      );
    }
    const expectedChallenge = createHash("sha256")
      .update(code_verifier)
      .digest("base64url");
    if (expectedChallenge !== codeData.codeChallenge) {
      return NextResponse.json(
        { error: "invalid_grant", error_description: "Code verifier mismatch" },
        { status: 400 }
      );
    }
  }

  const { accessToken, refreshToken } = issueTokens(
    client_id,
    codeData.profile,
    config.oauthJwtSecret
  );

  return NextResponse.json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
  });
}

function handleRefreshToken(
  params: Record<string, string>,
  config: ReturnType<typeof loadConfig>
) {
  const { refresh_token, client_id } = params;

  if (!refresh_token) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Refresh token required" },
      { status: 400 }
    );
  }

  // Verify the refresh token signature and expiry
  const payload = verifyJwt(refresh_token, config.oauthJwtSecret);
  if (!payload || payload.type !== "refresh") {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Invalid or expired refresh token" },
      { status: 400 }
    );
  }

  // Verify the refresh token belongs to this client
  if (payload.sub !== client_id) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Token client mismatch" },
      { status: 400 }
    );
  }

  // Issue new access + refresh tokens (rotate refresh token)
  const { accessToken, refreshToken: newRefreshToken } = issueTokens(
    client_id,
    (payload.scope as string) || "admin",
    config.oauthJwtSecret
  );

  return NextResponse.json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: newRefreshToken,
  });
}
