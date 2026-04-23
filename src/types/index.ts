export interface TokenEntry {
  token: string;
  profile: string;
  label: string;
}

export interface AuthTokensConfig {
  tokens: TokenEntry[];
}

export interface AuthResult {
  profile: string;
  label: string;
}

export interface AuthContext {
  profile: string;
  label: string;
}

export interface OperationPattern {
  method: string;
  pathPattern: string;
}

// Re-export RBAC types from their source module
export type { Permission, RoleDefinition, RoleMap } from "@/security/rbac";

export interface MicrosoftSsoConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  groupProfiles: Record<string, string>;
}

export interface GoogleSsoConfig {
  clientId: string;
  clientSecret: string;
  emailProfiles: Record<string, string>;
}

export interface CustomAuthConfig {
  encryptionKey: string;
  adminToken: string;
  issuer: string;
}

export interface AppConfig {
  neonApiKey: string;
  authTokens: AuthTokensConfig;
  roles: import("@/security/rbac").RoleMap;
  allowedOperations: OperationPattern[];
  requestTimeoutMs: number;
  maxResponseBytes: number;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthJwtSecret: string;
  publicUrl: string;
  microsoft: MicrosoftSsoConfig | null;
  google: GoogleSsoConfig | null;
  custom: CustomAuthConfig | null;
  databaseUrl: string;
}

export interface AuditEntry {
  audit: true;
  timestamp: string;
  action: "tool_call" | "auth_failure" | "access_denied" | "write_approved" | "rate_limited";
  tool?: string;
  method?: string;
  path?: string;
  profile: string;
  tokenLabel: string;
  result: "success" | "denied" | "error";
  errorCode?: string;
}

export interface NeonResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  method: string;
  path: string;
  pathParams: string[];
  queryParams: OpenAPIParam[];
  requestBody?: unknown;
  prefix: string;
}

export interface OpenAPIParam {
  name: string;
  in: "path" | "query" | "header";
  required: boolean;
  description?: string;
  schema: Record<string, unknown>;
}

export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParam[];
  requestBody?: {
    content?: {
      "application/json"?: {
        schema?: Record<string, unknown>;
      };
    };
  };
}

export interface OpenAPISpec {
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components?: {
    schemas?: Record<string, unknown>;
  };
}
