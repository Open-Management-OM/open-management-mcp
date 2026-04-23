import { describe, it, expect } from "vitest";
import { signSession, verifySession, tokensEqual, readAdminCookie } from "@/security/admin-session";

const SECRET = "admin-signing-secret";

describe("admin-session", () => {
  it("round-trips a signed session cookie", () => {
    const token = signSession(SECRET);
    const session = verifySession(token, SECRET);
    expect(session).not.toBeNull();
    expect(session!.admin).toBe(true);
  });

  it("rejects a session signed with a different secret", () => {
    const token = signSession(SECRET);
    expect(verifySession(token, "other")).toBeNull();
  });

  it("rejects a tampered session cookie", () => {
    const token = signSession(SECRET);
    const [encoded] = token.split(".");
    expect(verifySession(`${encoded}.bogus`, SECRET)).toBeNull();
  });

  it("rejects a malformed session value", () => {
    expect(verifySession("", SECRET)).toBeNull();
    expect(verifySession("no-dot", SECRET)).toBeNull();
  });
});

describe("tokensEqual", () => {
  it("returns true for matching strings", () => {
    expect(tokensEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different lengths", () => {
    expect(tokensEqual("abc", "abcd")).toBe(false);
  });

  it("returns false for different content of equal length", () => {
    expect(tokensEqual("abcd", "abce")).toBe(false);
  });
});

describe("readAdminCookie", () => {
  it("reads the admin session cookie from a header", () => {
    expect(readAdminCookie("foo=bar; mcp_admin_session=xyz")).toBe("xyz");
  });

  it("returns null when no admin cookie present", () => {
    expect(readAdminCookie("foo=bar")).toBeNull();
    expect(readAdminCookie("")).toBeNull();
  });
});
