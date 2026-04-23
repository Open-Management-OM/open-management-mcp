import { describe, it, expect } from "vitest";
import { signStep, verifyStep, readCookie } from "@/security/custom-state";

const SECRET = "test-secret-key-for-signing";

const base = {
  step: "mfa_challenge" as const,
  email: "user@acme.com",
  claudeClientId: "test-client",
  claudeRedirectUri: "https://example.com/callback",
  claudeState: "abc123",
  claudeCodeChallenge: "chal",
  claudeCodeChallengeMethod: "S256",
};

describe("custom-state", () => {
  it("round-trips a signed step cookie", () => {
    const token = signStep(base, SECRET);
    const verified = verifyStep(token, SECRET);
    expect(verified).not.toBeNull();
    expect(verified!.email).toBe("user@acme.com");
    expect(verified!.step).toBe("mfa_challenge");
  });

  it("rejects a cookie signed with a different secret", () => {
    const token = signStep(base, SECRET);
    expect(verifyStep(token, "different")).toBeNull();
  });

  it("rejects a tampered cookie", () => {
    const token = signStep(base, SECRET);
    const [encoded] = token.split(".");
    const tampered = `${encoded}.bogus-signature`;
    expect(verifyStep(tampered, SECRET)).toBeNull();
  });

  it("rejects a malformed cookie", () => {
    expect(verifyStep("", SECRET)).toBeNull();
    expect(verifyStep("no-dot", SECRET)).toBeNull();
    expect(verifyStep(".", SECRET)).toBeNull();
  });

  it("carries pendingSecret through enrollment step", () => {
    const token = signStep({ ...base, step: "mfa_enroll", pendingSecret: "JBSWY3DPEHPK3PXP" }, SECRET);
    const verified = verifyStep(token, SECRET);
    expect(verified!.pendingSecret).toBe("JBSWY3DPEHPK3PXP");
  });
});

describe("readCookie", () => {
  it("reads a named cookie from a header", () => {
    expect(readCookie("foo=bar; mcp_custom_step=xyz; baz=qux", "mcp_custom_step")).toBe("xyz");
  });

  it("returns null when the cookie is missing", () => {
    expect(readCookie("foo=bar", "mcp_custom_step")).toBeNull();
    expect(readCookie("", "mcp_custom_step")).toBeNull();
  });

  it("handles cookies at the start, middle, and end of the header", () => {
    expect(readCookie("mcp_custom_step=1", "mcp_custom_step")).toBe("1");
    expect(readCookie("a=b; mcp_custom_step=2", "mcp_custom_step")).toBe("2");
    expect(readCookie("mcp_custom_step=3; a=b", "mcp_custom_step")).toBe("3");
  });

  it("preserves = in cookie values", () => {
    expect(readCookie("mcp_custom_step=abc=def.sig", "mcp_custom_step")).toBe("abc=def.sig");
  });
});
