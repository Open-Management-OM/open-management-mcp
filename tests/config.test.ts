import { describe, it, expect, beforeEach, vi } from "vitest";

describe("loadConfig", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  const validTokensJson = JSON.stringify({
    tokens: [{ token: "tok_abc", profile: "developer", label: "dev-token" }],
  });

  it("loads required env vars and returns a typed AppConfig", async () => {
    vi.stubEnv("NEON_API_KEY", "neon-key-123");
    vi.stubEnv("MCP_AUTH_TOKENS", validTokensJson);

    const { loadConfig } = await import("@/config");
    const config = loadConfig();

    expect(config.neonApiKey).toBe("neon-key-123");
    expect(config.authTokens.tokens).toHaveLength(1);
    expect(config.authTokens.tokens[0].token).toBe("tok_abc");
    expect(config.authTokens.tokens[0].profile).toBe("developer");
    expect(config.authTokens.tokens[0].label).toBe("dev-token");
  });

  it("throws if NEON_API_KEY is missing", async () => {
    vi.stubEnv("NEON_API_KEY", "");
    vi.stubEnv("MCP_AUTH_TOKENS", validTokensJson);

    const { loadConfig } = await import("@/config");
    expect(() => loadConfig()).toThrow(/NEON_API_KEY/);
  });

  it("throws if MCP_AUTH_TOKENS is missing", async () => {
    vi.stubEnv("NEON_API_KEY", "neon-key-123");
    vi.stubEnv("MCP_AUTH_TOKENS", "");

    const { loadConfig } = await import("@/config");
    expect(() => loadConfig()).toThrow(/MCP_AUTH_TOKENS/);
  });

  it("throws if MCP_AUTH_TOKENS has an empty tokens array", async () => {
    vi.stubEnv("NEON_API_KEY", "neon-key-123");
    vi.stubEnv("MCP_AUTH_TOKENS", JSON.stringify({ tokens: [] }));

    const { loadConfig } = await import("@/config");
    expect(() => loadConfig()).toThrow(/MCP_AUTH_TOKENS/);
  });

  it("uses default values for all optional config", async () => {
    vi.stubEnv("NEON_API_KEY", "neon-key-123");
    vi.stubEnv("MCP_AUTH_TOKENS", validTokensJson);

    const { loadConfig } = await import("@/config");
    const config = loadConfig();

    expect(config.requestTimeoutMs).toBe(30000);
    expect(config.maxResponseBytes).toBe(1048576);
  });

  it("loads default RBAC roles", async () => {
    vi.stubEnv("NEON_API_KEY", "neon-key-123");
    vi.stubEnv("MCP_AUTH_TOKENS", validTokensJson);

    const { loadConfig } = await import("@/config");
    const config = loadConfig();

    expect(config.roles.admin).toBeDefined();
    expect(config.roles.admin.permissions).toContainEqual({ category: "*", verb: "*" });
    expect(config.roles.viewer).toBeDefined();
    expect(config.roles.viewer.permissions).toContainEqual({ category: "*", verb: "read" });
    expect(config.roles.member).toBeDefined();
    expect(config.roles.finance).toBeDefined();
  });

  it("loads default allowed operations", async () => {
    vi.stubEnv("NEON_API_KEY", "neon-key-123");
    vi.stubEnv("MCP_AUTH_TOKENS", validTokensJson);

    const { loadConfig } = await import("@/config");
    const config = loadConfig();

    expect(config.allowedOperations.length).toBeGreaterThan(0);
    const projectsOp = config.allowedOperations.find(
      (op) => op.method === "get" && op.pathPattern === "^/projects$"
    );
    expect(projectsOp).toBeDefined();
  });

  it("parses custom RBAC_PROFILES override", async () => {
    vi.stubEnv("NEON_API_KEY", "neon-key-123");
    vi.stubEnv("MCP_AUTH_TOKENS", validTokensJson);
    vi.stubEnv("RBAC_PROFILES", JSON.stringify({
      custom: { permissions: [{ category: "work", verb: "read" }] },
    }));

    const { loadConfig } = await import("@/config");
    const config = loadConfig();

    expect(config.roles.custom).toBeDefined();
    expect(config.roles.custom.permissions).toContainEqual({ category: "work", verb: "read" });
  });

  it("throws on invalid JSON in MCP_AUTH_TOKENS", async () => {
    vi.stubEnv("NEON_API_KEY", "neon-key-123");
    vi.stubEnv("MCP_AUTH_TOKENS", "not-valid-json");

    const { loadConfig } = await import("@/config");
    expect(() => loadConfig()).toThrow();
  });
});
