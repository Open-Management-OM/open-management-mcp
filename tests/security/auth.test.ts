import { describe, it, expect } from "vitest";
import { authenticateToken } from "@/security/auth";
import type { AuthTokensConfig } from "@/types";

const config: AuthTokensConfig = {
  tokens: [
    { token: "tok_developer_abc", profile: "developer", label: "dev-token" },
    { token: "tok_admin_xyz", profile: "admin", label: "admin-token" },
    { token: "tok_readonly_111", profile: "readonly", label: "readonly-token" },
  ],
};

describe("authenticateToken", () => {
  it("returns profile and label for a valid token", () => {
    const result = authenticateToken("tok_developer_abc", config);
    expect(result).not.toBeNull();
    expect(result?.profile).toBe("developer");
    expect(result?.label).toBe("dev-token");
  });

  it("returns null for an invalid token", () => {
    const result = authenticateToken("tok_bogus_000", config);
    expect(result).toBeNull();
  });

  it("returns null for an empty string", () => {
    const result = authenticateToken("", config);
    expect(result).toBeNull();
  });

  it("returns null for undefined cast to string", () => {
    // @ts-expect-error testing runtime behavior
    const result = authenticateToken(undefined, config);
    expect(result).toBeNull();
  });

  it("matches the correct token among multiple entries", () => {
    const adminResult = authenticateToken("tok_admin_xyz", config);
    expect(adminResult?.profile).toBe("admin");
    expect(adminResult?.label).toBe("admin-token");

    const readonlyResult = authenticateToken("tok_readonly_111", config);
    expect(readonlyResult?.profile).toBe("readonly");
    expect(readonlyResult?.label).toBe("readonly-token");
  });

  it("does not match a partial token prefix", () => {
    const result = authenticateToken("tok_developer", config);
    expect(result).toBeNull();
  });

  it("is case sensitive", () => {
    const result = authenticateToken("TOK_DEVELOPER_ABC", config);
    expect(result).toBeNull();
  });
});
