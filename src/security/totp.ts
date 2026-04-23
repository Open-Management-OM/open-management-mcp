import { generateSecret, generateURI, verify } from "otplib";
import { createHash, randomBytes } from "crypto";
import QRCode from "qrcode";

const PERIOD_SECONDS = 30;

export interface TotpEnrollment {
  secret: string;
  otpauthUri: string;
}

export function enroll(email: string, issuer: string): TotpEnrollment {
  const secret = generateSecret();
  const otpauthUri = generateURI({
    strategy: "totp",
    issuer,
    label: email,
    secret,
    algorithm: "sha1",
    digits: 6,
    period: PERIOD_SECONDS,
  });
  return { secret, otpauthUri };
}

export async function validateCode(code: string, secret: string): Promise<boolean> {
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    const result = await verify({
      secret,
      token: cleaned,
      strategy: "totp",
      algorithm: "sha1",
      digits: 6,
      period: PERIOD_SECONDS,
      epochTolerance: PERIOD_SECONDS,
    });
    return result.valid;
  } catch {
    return false;
  }
}

export async function renderQrPngDataUri(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: "M", margin: 2, width: 240 });
}

export async function renderQrSvg(otpauthUri: string): Promise<string> {
  return QRCode.toString(otpauthUri, { type: "svg", errorCorrectionLevel: "M", margin: 2, width: 240 });
}

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(randomBytes(4).toString("hex"));
  }
  return codes;
}

export function hashBackupCode(code: string): string {
  const cleaned = code.replace(/\s+/g, "").toLowerCase();
  return createHash("sha256").update(cleaned).digest("hex");
}

export function consumeBackupCode(submitted: string, storedHashes: string[]): { matched: boolean; remaining: string[] } {
  const hash = hashBackupCode(submitted);
  const index = storedHashes.indexOf(hash);
  if (index === -1) return { matched: false, remaining: storedHashes };
  const remaining = storedHashes.filter((_, i) => i !== index);
  return { matched: true, remaining };
}
