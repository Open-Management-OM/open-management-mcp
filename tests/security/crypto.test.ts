import { describe, it, expect } from "vitest";
import { encrypt, decrypt, generateEncryptionKey, constantTimeEqualHex } from "@/security/crypto";

const KEY = "0".repeat(64);

describe("crypto", () => {
  it("round-trips plaintext through encrypt and decrypt", () => {
    const { ciphertext, nonce } = encrypt("hello world", KEY);
    expect(decrypt(ciphertext, nonce, KEY)).toBe("hello world");
  });

  it("produces different ciphertext for the same plaintext on each call (random nonce)", () => {
    const a = encrypt("same plaintext", KEY);
    const b = encrypt("same plaintext", KEY);
    expect(Buffer.compare(a.nonce, b.nonce)).not.toBe(0);
    expect(Buffer.compare(a.ciphertext, b.ciphertext)).not.toBe(0);
  });

  it("fails to decrypt with a different key", () => {
    const { ciphertext, nonce } = encrypt("secret", KEY);
    const otherKey = "1".repeat(64);
    expect(() => decrypt(ciphertext, nonce, otherKey)).toThrow();
  });

  it("fails to decrypt with a tampered ciphertext (GCM tag check)", () => {
    const { ciphertext, nonce } = encrypt("secret", KEY);
    const tampered = Buffer.from(ciphertext);
    tampered[0] ^= 0x01;
    expect(() => decrypt(tampered, nonce, KEY)).toThrow();
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => encrypt("x", "00")).toThrow(/must be 64 hex chars/);
    expect(() => encrypt("x", "00".repeat(16))).toThrow(/must be 64 hex chars/);
  });

  it("rejects ciphertext that is too short to contain the auth tag", () => {
    expect(() => decrypt(Buffer.from("short"), Buffer.alloc(12), KEY)).toThrow(/Ciphertext too short/);
  });

  it("generates 32-byte hex keys", () => {
    const k = generateEncryptionKey();
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });

  it("constantTimeEqualHex returns true for identical strings and false otherwise", () => {
    expect(constantTimeEqualHex("abcd", "abcd")).toBe(true);
    expect(constantTimeEqualHex("abcd", "abce")).toBe(false);
    expect(constantTimeEqualHex("abcd", "abcde")).toBe(false);
  });
});
