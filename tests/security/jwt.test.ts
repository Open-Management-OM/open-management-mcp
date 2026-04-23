import { describe, it, expect, vi, afterEach } from "vitest";
import { signJwt, verifyJwt, decodeJwtPayload } from "@/security/jwt";

const SECRET = "test-secret-key";

describe("signJwt", () => {
  it("returns a 3-part dot-separated string", () => {
    const token = signJwt({ sub: "user1" }, SECRET, 3600);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    parts.forEach((p) => expect(p.length).toBeGreaterThan(0));
  });

  it("embeds payload with exp claim", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ sub: "user1", role: "admin" }, SECRET, 3600);
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString()
    );
    expect(payload.sub).toBe("user1");
    expect(payload.role).toBe("admin");
    expect(payload.exp).toBeGreaterThanOrEqual(now + 3600);
    expect(payload.exp).toBeLessThanOrEqual(now + 3601);
  });
});

describe("verifyJwt", () => {
  it("returns payload for valid token", () => {
    const token = signJwt({ sub: "user1", scope: "admin" }, SECRET, 3600);
    const payload = verifyJwt(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user1");
    expect(payload!.scope).toBe("admin");
  });

  it("returns null for wrong secret", () => {
    const token = signJwt({ sub: "user1" }, SECRET, 3600);
    expect(verifyJwt(token, "wrong-secret")).toBeNull();
  });

  it("returns null for expired token", () => {
    vi.useFakeTimers();
    const token = signJwt({ sub: "user1" }, SECRET, 1);
    // Advance past expiry
    vi.advanceTimersByTime(2000);
    expect(verifyJwt(token, SECRET)).toBeNull();
    vi.useRealTimers();
  });

  it("returns null for malformed token", () => {
    expect(verifyJwt("not.a.jwt", SECRET)).toBeNull();
    expect(verifyJwt("", SECRET)).toBeNull();
    expect(verifyJwt("one.two", SECRET)).toBeNull();
  });
});

describe("decodeJwtPayload", () => {
  it("decodes base64url payload without verification", () => {
    const token = signJwt({ sub: "user1", email: "a@b.com" }, SECRET, 3600);
    const payload = decodeJwtPayload(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user1");
    expect(payload!.email).toBe("a@b.com");
  });

  it("returns null for malformed input", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("a.b")).toBeNull();
  });
});
