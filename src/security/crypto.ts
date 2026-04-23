import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto";

const ALGO = "aes-256-gcm";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface Encrypted {
  ciphertext: Buffer;
  nonce: Buffer;
}

function parseKey(hexKey: string): Buffer {
  const key = Buffer.from(hexKey, "hex");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CUSTOM_AUTH_ENCRYPTION_KEY must be ${KEY_BYTES * 2} hex chars (${KEY_BYTES} bytes). Got ${key.length} bytes.`
    );
  }
  return key;
}

export function encrypt(plaintext: string, hexKey: string): Encrypted {
  const key = parseKey(hexKey);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGO, key, nonce);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([enc, tag]), nonce };
}

export function decrypt(ciphertext: Buffer, nonce: Buffer, hexKey: string): string {
  const key = parseKey(hexKey);
  if (ciphertext.length < TAG_BYTES) {
    throw new Error("Ciphertext too short to contain auth tag");
  }
  const enc = ciphertext.subarray(0, ciphertext.length - TAG_BYTES);
  const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function generateEncryptionKey(): string {
  return randomBytes(KEY_BYTES).toString("hex");
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
