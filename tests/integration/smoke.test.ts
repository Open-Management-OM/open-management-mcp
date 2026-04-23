import { describe, it, expect } from "vitest";
import { loadConfig } from "@/config";
import { NeonClient } from "@/http/client";
import { generateToolDefinitions } from "@/tools/registry";
import { authenticateToken } from "@/security/auth";
import { isAllowed, methodToVerb } from "@/security/rbac";
import { classifyPrefix } from "@/security/categories";
import type { OpenAPISpec } from "@/types";
import specJson from "../../spec/neon-v2.json";

const hasApiKey = !!process.env.NEON_API_KEY;
const hasMcpTokens = !!process.env.MCP_AUTH_TOKENS;

describe.skipIf(!hasApiKey || !hasMcpTokens)("Integration smoke tests", () => {
  it("loads config from env", () => {
    const config = loadConfig();
    expect(config.neonApiKey).toBeTruthy();
    expect(config.authTokens.tokens.length).toBeGreaterThan(0);
  });

  it("generates tools from spec", () => {
    const config = loadConfig();
    const allOps = [...config.allowedOperations];
    const tools = generateToolDefinitions(specJson as unknown as OpenAPISpec, allOps);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.length).toBeLessThanOrEqual(128);
    console.log(`Generated ${tools.length} tools`);
  });

  it("authenticates valid token", () => {
    const config = loadConfig();
    const firstToken = config.authTokens.tokens[0];
    const result = authenticateToken(firstToken.token, config.authTokens);
    expect(result).not.toBeNull();
    expect(result?.profile).toBe(firstToken.profile);
  });

  it("RBAC allows admin to access all tools", () => {
    const config = loadConfig();
    const allOps = [...config.allowedOperations];
    const tools = generateToolDefinitions(specJson as unknown as OpenAPISpec, allOps);
    for (const tool of tools) {
      const category = classifyPrefix(tool.prefix);
      const verb = methodToVerb(tool.method);
      expect(isAllowed(category, verb, "admin", config.roles)).toBe(true);
    }
  });

  it("fetches projects from Neon API", async () => {
    const config = loadConfig();
    const client = new NeonClient(config.neonApiKey, { timeoutMs: config.requestTimeoutMs });
    // Use project-scoped endpoint if NEON_PROJECT_ID is set, otherwise list all projects.
    // A project-scoped API key will 404 on /projects but succeed on /projects/:id.
    const projectId = process.env.NEON_PROJECT_ID;
    const path = projectId ? `/projects/${projectId}` : "/projects";
    const response = await client.request("get", path);
    expect(response.status).toBe(200);
    expect(response.data).toBeTruthy();
    console.log("Projects response status:", response.status);
  });
});
