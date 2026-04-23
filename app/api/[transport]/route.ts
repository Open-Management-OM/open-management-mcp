import { createMcpHandler, experimental_withMcpAuth as withMcpAuth } from "mcp-handler";
import { loadConfig } from "@/config";
import { registerDatabaseTools } from "@/tools/database";
import { registerWarehouseTools } from "@/tools/warehouse";
import { generateToolDefinitions } from "@/tools/registry";
import { registerTools } from "@/tools/register";
import { NeonClient } from "@/http/client";
import { authenticateToken } from "@/security/auth";
import { createAuditLogger } from "@/security/audit";
import { verifyJwt } from "@/security/jwt";
import type { AuthContext, OpenAPISpec } from "@/types";
import specJson from "../../../spec/neon-v2.json";

const config = loadConfig();
const audit = createAuditLogger();
const neonClient = new NeonClient(config.neonApiKey, { timeoutMs: config.requestTimeoutMs });
const toolDefinitions = generateToolDefinitions(specJson as unknown as OpenAPISpec, config.allowedOperations);

let currentAuth: AuthContext = { profile: "unknown", label: "unknown" };

export function getAuthContext(): AuthContext {
  return currentAuth;
}

const mcpHandler = createMcpHandler(
  (server) => {
    registerWarehouseTools(server, getAuthContext, config);
    registerDatabaseTools(server, config.databaseUrl, getAuthContext, config);
    registerTools(server, toolDefinitions, config, neonClient, getAuthContext);
  },
  { serverInfo: { name: "neon-mcp", version: "1.0.0" } },
  { basePath: "/api", maxDuration: 60 }
);

const handler = withMcpAuth(mcpHandler, async (_req, bearerToken) => {
  if (!bearerToken) {
    currentAuth = { profile: "unknown", label: "none" };
    audit.log({
      action: "auth_failure",
      profile: "unknown",
      tokenLabel: "none",
      result: "denied",
      errorCode: "missing_token",
    });
    return undefined;
  }

  const result = authenticateToken(bearerToken, config.authTokens);
  if (result) {
    currentAuth = { profile: result.profile, label: result.label };
    return { token: bearerToken, clientId: result.label, scopes: [result.profile] };
  }

  // Try JWT verification (OAuth flow)
  const jwt = verifyJwt(bearerToken, config.oauthJwtSecret);
  if (jwt) {
    currentAuth = { profile: String(jwt.scope || "readonly"), label: String(jwt.sub || "oauth-user") };
    return { token: bearerToken, clientId: String(jwt.sub || "oauth-user"), scopes: [String(jwt.scope || "readonly")] };
  }

  currentAuth = { profile: "unknown", label: "none" };
  audit.log({
    action: "auth_failure",
    profile: "unknown",
    tokenLabel: "none",
    result: "denied",
    errorCode: "invalid_token",
  });
  return undefined;
}, { required: true });

export { handler as GET, handler as POST, handler as DELETE };
