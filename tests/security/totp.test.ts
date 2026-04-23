import { describe, it, expect } from "vitest";
import { generate } from "otplib";
import {
  enroll,
  generateBackupCodes,
  hashBackupCode,
  consumeBackupCode,
  validateCode,
  renderQrSvg,
} from "@/security/totp";

describe("totp", () => {
  it("enrolls a user with a base32 secret and valid otpauth URI", () => {
    const { secret, otpauthUri } = enroll("user@acme.com", "Acme MCP");
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(otpauthUri).toContain("Acme%20MCP");
    expect(otpauthUri).toContain("user%40acme.com");
    expect(otpauthUri).toContain("secret=" + secret);
  });

  it("validates a code generated against the same secret", async () => {
    const { secret } = enroll("user@acme.com", "Acme MCP");
    const code = await generate({
      secret,
      strategy: "totp",
      algorithm: "sha1",
      digits: 6,
      period: 30,
    });
    expect(await validateCode(code, secret)).toBe(true);
  });

  it("rejects a code from a different secret", async () => {
    const a = enroll("a@example.com", "Test").secret;
    const b = enroll("b@example.com", "Test").secret;
    const code = await generate({ secret: a, strategy: "totp", algorithm: "sha1", digits: 6, period: 30 });
    expect(await validateCode(code, b)).toBe(false);
  });

  it("rejects codes that aren't 6 digits", async () => {
    const { secret } = enroll("user@acme.com", "Test");
    expect(await validateCode("12345", secret)).toBe(false);
    expect(await validateCode("1234567", secret)).toBe(false);
    expect(await validateCode("abcdef", secret)).toBe(false);
  });

  it("accepts codes with whitespace (e.g. '123 456')", async () => {
    const { secret } = enroll("user@acme.com", "Test");
    const code = await generate({ secret, strategy: "totp", algorithm: "sha1", digits: 6, period: 30 });
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect(await validateCode(spaced, secret)).toBe(true);
  });

  it("generates the requested number of backup codes with 8 hex chars each", () => {
    const codes = generateBackupCodes(10);
    expect(codes.length).toBe(10);
    for (const c of codes) {
      expect(c).toMatch(/^[0-9a-f]{8}$/);
    }
    expect(new Set(codes).size).toBe(10);
  });

  it("hashBackupCode is case-insensitive and ignores whitespace", () => {
    expect(hashBackupCode("ABCD1234")).toBe(hashBackupCode("abcd1234"));
    expect(hashBackupCode("abcd 1234")).toBe(hashBackupCode("abcd1234"));
  });

  it("consumeBackupCode removes a matched code from the stored list", () => {
    const codes = ["aaa111bb", "bbb222cc", "ccc333dd"];
    const hashes = codes.map(hashBackupCode);
    const result = consumeBackupCode("bbb222cc", hashes);
    expect(result.matched).toBe(true);
    expect(result.remaining.length).toBe(2);
    expect(result.remaining).not.toContain(hashBackupCode("bbb222cc"));
  });

  it("consumeBackupCode returns unchanged list for unknown codes", () => {
    const codes = ["aaa111bb", "bbb222cc"];
    const hashes = codes.map(hashBackupCode);
    const result = consumeBackupCode("deadbeef", hashes);
    expect(result.matched).toBe(false);
    expect(result.remaining).toEqual(hashes);
  });

  it("renders an SVG QR code for the otpauth URI", async () => {
    const { otpauthUri } = enroll("user@acme.com", "Test");
    const svg = await renderQrSvg(otpauthUri);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });
});
