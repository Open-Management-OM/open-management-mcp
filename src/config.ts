import type {
  AppConfig,
  AuthTokensConfig,
  CustomAuthConfig,
  GoogleSsoConfig,
  MicrosoftSsoConfig,
  OperationPattern,
} from "@/types";
import { DEFAULT_ROLES } from "@/security/rbac";
import type { RoleMap } from "@/security/rbac";

const DEFAULT_ALLOWED_OPERATIONS: OperationPattern[] = [
  { method: "get", pathPattern: "^/projects$" },
  { method: "get", pathPattern: "^/projects/shared$" },
  { method: "get", pathPattern: "^/projects/[^/]+$" },
  { method: "get", pathPattern: "^/projects/[^/]+/advisors$" },
  { method: "get", pathPattern: "^/projects/[^/]+/connection_uri$" },
  { method: "get", pathPattern: "^/projects/[^/]+/branches$" },
  { method: "get", pathPattern: "^/projects/[^/]+/branches/count$" },
  { method: "get", pathPattern: "^/projects/[^/]+/branches/[^/]+$" },
  { method: "get", pathPattern: "^/projects/[^/]+/branches/[^/]+/schema$" },
  { method: "get", pathPattern: "^/projects/[^/]+/branches/[^/]+/compare_schema$" },
  { method: "get", pathPattern: "^/projects/[^/]+/branches/[^/]+/endpoints$" },
  { method: "get", pathPattern: "^/projects/[^/]+/branches/[^/]+/databases$" },
  { method: "get", pathPattern: "^/projects/[^/]+/branches/[^/]+/databases/[^/]+$" },
  { method: "get", pathPattern: "^/projects/[^/]+/branches/[^/]+/roles$" },
  { method: "get", pathPattern: "^/projects/[^/]+/branches/[^/]+/roles/[^/]+$" },
  { method: "get", pathPattern: "^/projects/[^/]+/endpoints$" },
  { method: "get", pathPattern: "^/projects/[^/]+/endpoints/[^/]+$" },
  { method: "get", pathPattern: "^/projects/[^/]+/operations$" },
  { method: "get", pathPattern: "^/projects/[^/]+/operations/[^/]+$" },
  { method: "get", pathPattern: "^/consumption_history/account$" },
  { method: "get", pathPattern: "^/consumption_history/projects$" },
  { method: "get", pathPattern: "^/regions$" },
  { method: "get", pathPattern: "^/api_keys$" },
];

function parseJson<T>(envVar: string, value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Failed to parse ${envVar} as JSON: ${value}`);
  }
}

export function loadConfig(): AppConfig {
  const neonApiKey = process.env.NEON_API_KEY;
  if (!neonApiKey) {
    throw new Error("NEON_API_KEY environment variable is required");
  }

  const authTokensRaw = process.env.MCP_AUTH_TOKENS;
  if (!authTokensRaw) {
    throw new Error("MCP_AUTH_TOKENS environment variable is required");
  }

  const authTokens = parseJson<AuthTokensConfig>("MCP_AUTH_TOKENS", authTokensRaw);
  if (!authTokens.tokens || authTokens.tokens.length === 0) {
    throw new Error("MCP_AUTH_TOKENS must contain at least one token entry");
  }

  // Optional: RBAC roles (category:verb model)
  const rolesRaw = process.env.RBAC_PROFILES;
  const roles: RoleMap = rolesRaw
    ? parseJson<RoleMap>("RBAC_PROFILES", rolesRaw)
    : DEFAULT_ROLES;

  // Optional: allowed operations
  const allowedOpsRaw = process.env.ALLOWED_OPERATIONS;
  const allowedOperations: OperationPattern[] = allowedOpsRaw
    ? parseJson<OperationPattern[]>("ALLOWED_OPERATIONS", allowedOpsRaw)
    : DEFAULT_ALLOWED_OPERATIONS;

  // Numeric config
  const requestTimeoutMs = Number(process.env.REQUEST_TIMEOUT_MS ?? 30000);
  const maxResponseBytes = Number(process.env.MAX_RESPONSE_BYTES ?? 1048576);

  return {
    neonApiKey,
    authTokens,
    roles,
    allowedOperations,
    requestTimeoutMs,
    maxResponseBytes,
    oauthClientId: process.env.OAUTH_CLIENT_ID || "",
    oauthClientSecret: process.env.OAUTH_CLIENT_SECRET || "",
    oauthJwtSecret: process.env.OAUTH_JWT_SECRET || neonApiKey,
    publicUrl: (process.env.PUBLIC_URL || process.env.VERCEL_URL
      ? (process.env.PUBLIC_URL || `https://${process.env.VERCEL_URL}`)
      : ""),
    microsoft: loadMicrosoftConfig(),
    google: loadGoogleConfig(),
    custom: loadCustomAuthConfig(),
    databaseUrl: process.env.DATABASE_URL || "",
  };
}

function loadCustomAuthConfig(): CustomAuthConfig | null {
  const encryptionKey = process.env.CUSTOM_AUTH_ENCRYPTION_KEY;
  const adminToken = process.env.CUSTOM_AUTH_ADMIN_TOKEN;
  const databaseUrl = process.env.DATABASE_URL;
  if (!encryptionKey || !adminToken || !databaseUrl) return null;
  if (encryptionKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(encryptionKey)) {
    throw new Error(
      "CUSTOM_AUTH_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  if (adminToken.length < 16) {
    throw new Error("CUSTOM_AUTH_ADMIN_TOKEN must be at least 16 characters. Use `openssl rand -base64 32`.");
  }
  return {
    encryptionKey,
    adminToken,
    issuer: process.env.CUSTOM_AUTH_ISSUER || "Claude MCP",
  };
}

function loadMicrosoftConfig(): MicrosoftSsoConfig | null {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const groupProfilesRaw = process.env.MICROSOFT_GROUP_PROFILES;
  if (!tenantId || !clientId || !clientSecret || !groupProfilesRaw) return null;
  const groupProfiles = parseJson<Record<string, string>>(
    "MICROSOFT_GROUP_PROFILES",
    groupProfilesRaw
  );
  if (!groupProfiles || Object.keys(groupProfiles).length === 0) return null;
  return { tenantId, clientId, clientSecret, groupProfiles };
}

function loadGoogleConfig(): GoogleSsoConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const emailProfilesRaw = process.env.GOOGLE_EMAIL_PROFILES;
  if (!clientId || !clientSecret || !emailProfilesRaw) return null;
  const emailProfilesParsed = parseJson<Record<string, string>>(
    "GOOGLE_EMAIL_PROFILES",
    emailProfilesRaw
  );
  if (!emailProfilesParsed || Object.keys(emailProfilesParsed).length === 0) return null;
  const emailProfiles: Record<string, string> = {};
  for (const [email, profile] of Object.entries(emailProfilesParsed)) {
    emailProfiles[email.toLowerCase()] = profile;
  }
  return { clientId, clientSecret, emailProfiles };
}
