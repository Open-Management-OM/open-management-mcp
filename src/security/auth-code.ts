import { createHmac, randomBytes } from "crypto";

export interface AuthCodePayload {
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  email: string;
  profile: string;
  exp: number;
  jti: string;
}

export function generateAuthCode(
  data: Omit<AuthCodePayload, "exp" | "jti">,
  secret: string
): string {
  const payload: AuthCodePayload = {
    ...data,
    exp: Date.now() + 60000,
    jti: randomBytes(16).toString("hex"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyAuthCode(
  code: string,
  secret: string
): Omit<AuthCodePayload, "exp" | "jti"> | null {
  try {
    const dotIndex = code.lastIndexOf(".");
    if (dotIndex === -1) return null;
    const encoded = code.slice(0, dotIndex);
    const sig = code.slice(dotIndex + 1);
    const expectedSig = createHmac("sha256", secret).update(encoded).digest("base64url");
    if (sig !== expectedSig) return null;
    const payload: AuthCodePayload = JSON.parse(
      Buffer.from(encoded, "base64url").toString()
    );
    if (payload.exp < Date.now()) return null;
    return {
      clientId: payload.clientId,
      redirectUri: payload.redirectUri,
      codeChallenge: payload.codeChallenge,
      codeChallengeMethod: payload.codeChallengeMethod,
      email: payload.email,
      profile: payload.profile,
    };
  } catch {
    return null;
  }
}
