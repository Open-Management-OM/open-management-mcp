# Neon MCP Server -- Design Document

**Date:** 2026-03-16
**Status:** Draft
**Repo:** mcp-neon
**Framework:** Based on mcp-connectwise-manage security framework

---

## 1. Purpose

A security-first TypeScript MCP server for the Neon (neon.tech) database platform, deployed on Vercel. Enables AI assistants to manage Neon projects, branches, databases, endpoints, and roles through the Model Context Protocol.

Doubles as a **proof of concept** for the ConnectWise MCP server framework -- same security rings, RBAC, audit trail, and deployment model, validated against a simpler API surface.

### Goals

- Prove the 5-ring security framework on a real API
- Token-to-profile RBAC so different users get different tool visibility
- OpenAPI-driven tool generation from Neon's spec
- Read-only by default, writes explicitly opted-in
- Usable from Claude on any device (phone, desktop) via Streamable HTTP
- Every action audited

### Non-Goals

- SQL query execution (use Neon's own MCP server or direct connection for that)
- Data migration tooling
- Multi-account support (one Neon API key per deployment)

---

## 2. Why Neon as Proof of Concept

| Dimension | Neon | ConnectWise |
|-----------|------|-------------|
| Spec size | 635KB | 7.2MB |
| Endpoints | 138 | 3,062 |
| Paths | 93 | 1,820 |
| Categories | 13 | 12 (but deeply nested) |
| Auth | Bearer token | Basic auth + clientId |
| Tool count concern | None (~57 GETs) | Critical (330 GETs with wildcards) |

Neon lets us validate the framework without fighting spec complexity. Every pattern that works here carries directly to ConnectWise.

---

## 3. Architecture

Same layered architecture as the ConnectWise MCP server:

```
┌─────────────────────────────────────────────────────────┐
│  MCP Transport (Streamable HTTP via Vercel)              │
│  mcp-handler + @modelcontextprotocol/sdk                 │
└──────────────────┬──────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Security Layer (5 rings)                                │
│  ┌──────────┐ ┌──────┐ ┌──────┐ ┌───────┐ ┌─────────┐  │
│  │ Network  │ │ Auth │ │ RBAC │ │ Write │ │ Audit   │  │
│  │ ACL      │ │      │ │      │ │ Gates │ │ Trail   │  │
│  └──────────┘ └──────┘ └──────┘ └───────┘ └─────────┘  │
└──────────────────┬──────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Tool Registry (OpenAPI-driven)                          │
│  ┌──────────┐ ┌───────────┐ ┌────────────────────────┐  │
│  │ Schema   │ │ Input     │ │ Safe Defaults          │  │
│  │ Builder  │ │ Validator │ │                         │  │
│  └──────────┘ └───────────┘ └────────────────────────┘  │
└──────────────────┬──────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────┐
│  HTTP Client                                             │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐             │
│  │ Auth     │ │ Rate      │ │ Retry +    │             │
│  │ (Bearer) │ │ Limiter   │ │ Backoff    │             │
│  └──────────┘ └───────────┘ └────────────┘             │
└──────────────────┬──────────────────────────────────────┘
                   ↓
            Neon API (console.neon.tech/api/v2)
```

---

## 4. Security Model (Zero Trust)

Five concentric rings. Identical framework to ConnectWise MCP server.

### Ring 1: Network Access Control

- Bypassed for stdio transport (localhost implicit trust)
- Enforced for HTTP transport via Vercel Firewall
- Config: `NEON_ALLOWED_IPS`, `NEON_ALLOWED_FQDNS` env vars

### Ring 2: Authentication

- Bearer token via `Authorization` header only
- `crypto.timingSafeEqual()` with SHA-256 pre-hash
- **Token-to-profile mapping** via `MCP_AUTH_TOKENS` JSON env var:

```json
{
  "tokens": [
    { "token": "tok_dev_abc123", "profile": "developer", "label": "Matt - Dev" },
    { "token": "tok_ro_def456", "profile": "readonly", "label": "Dashboard Bot" },
    { "token": "tok_admin_ghi789", "profile": "admin", "label": "Matt - Admin" }
  ]
}
```

- `label` for audit logs only
- Rate-limited: 5 failed attempts per minute, then 60s lockout
- No default token -- server refuses to start if `MCP_AUTH_TOKENS` is missing or empty

### Ring 3: RBAC Profiles

```typescript
const defaultProfiles: Record<string, string[]> = {
  developer: ["proj-", "branch-", "ep-", "db-", "role-", "op-"],
  readonly:  ["proj-", "branch-", "ep-", "op-", "region-"],
  billing:   ["consumption-", "proj-list"],
  admin:     [""],  // wildcard
};
```

- Tools not matching the token's bound profile are never registered (invisible to client)
- Profile determined at auth time from token mapping
- No default profile -- token without valid profile mapping is rejected
- Profiles configurable via `NEON_PROFILES` JSON env var

### Ring 4: Operation Control

**Allowlists:**
- `NEON_ALLOWED_OPERATIONS`: Regex patterns for exposed endpoints (default: read-only GETs)
- `NEON_WRITE_ALLOWLIST`: Separate patterns for POST/PATCH/PUT/DELETE

**Write operation gates (in order):**
1. Blackout window check (`NEON_BLACKOUT_WINDOWS`)
2. Dry-run response -- preview what would be sent
3. Confirm gate -- require `confirm: true`
4. Write execution + audit log entry

**Safe defaults injection:**
- `limit`: clamped to `[1, 100]` (default: 50)
- `offset`: defaults to 0

### Ring 5: Audit Trail

```typescript
interface AuditEntry {
  timestamp: string;       // ISO 8601 UTC
  action: "tool_call" | "auth_failure" | "access_denied" | "write_approved" | "rate_limited";
  tool?: string;           // tool alias (e.g. "proj-listProjects")
  method?: string;         // HTTP method
  path?: string;           // Neon API path (no query params)
  profile: string;         // RBAC profile bound to the token
  tokenLabel: string;      // human-readable label
  sourceIP?: string;       // client IP
  result: "success" | "denied" | "error";
  dryRun?: boolean;
  confirmed?: boolean;
  errorCode?: string;
}
```

- Structured JSON via pino to stdout
- Never logs: credentials, request/response bodies, PII, query parameters
- Always logs: tool name, method, path, profile, tokenLabel, result, timestamps

---

## 5. Tool Generation

### Semantic Prefixes

| Prefix | Neon Category | Example Tools |
|--------|---------------|---------------|
| `proj-` | Project | `proj-listProjects`, `proj-getProject` |
| `branch-` | Branch | `branch-listBranches`, `branch-getBranch` |
| `ep-` | Endpoint (compute) | `ep-listEndpoints`, `ep-startEndpoint` |
| `db-` | Database | `db-listDatabases`, `db-createDatabase` |
| `role-` | Role | `role-listRoles`, `role-getRole` |
| `op-` | Operation | `op-getOperation`, `op-listOperations` |
| `consumption-` | Consumption | `consumption-getAccountHistory` |
| `region-` | Region | `region-listRegions` |
| `org-` | Organization | `org-listOrgs`, `org-getOrg` |
| `snapshot-` | Snapshot | `snapshot-listSnapshots` |

### Tool Count

138 total operations. With default read-only allowlist: ~57 GET tools. Well within the 40-80 target range -- no filtering concerns.

### Spec Performance

635KB spec -- trivial. Lazy-load + module-scope cache. No build-time processing needed. First-request parse penalty is negligible.

### Input Validation

- AJV with `removeAdditional: "failing"`, `useDefaults: true`
- Path parameters validated (no traversal)
- Types, formats, enums derived from OpenAPI spec

---

## 6. HTTP Client

```typescript
class NeonClient {
  private apiKey: string;  // cached Bearer token
  private baseUrl = "https://console.neon.tech/api/v2";

  async request(method: string, path: string, options?: RequestOptions): Promise<NeonResponse> {
    // 1. Validate path
    // 2. Check rate limiter (in-memory min interval)
    // 3. Build URL
    // 4. Execute with AbortController timeout
    // 5. Retry with exponential backoff (3 attempts, 2s/4s/8s)
    // 6. Redact sensitive data from error logs
    // 7. Return typed response
  }
}
```

**Auth:** Bearer token in `Authorization` header. Single `NEON_API_KEY` env var.

**Rate limiting:** In-memory minimum interval throttle (module-scope). Neon allows 700 req/min, 40 req/s burst. Default floor: 100ms between requests (10 req/s -- well under limits).

**Retry:** Exponential backoff with jitter. Retry on 429 and 5xx. No retry on 4xx.

**Timeout:** 30s default, configurable via `NEON_REQUEST_TIMEOUT_MS`.

### Error Handling

- **401/403:** "Access denied by Neon API. Check API key."
- **404:** "Resource not found."
- **429:** "Neon rate limit exceeded. Try again shortly."
- **5xx:** "Neon API server error."
- Never forward raw error bodies.

---

## 7. Infrastructure

### Deployment: Vercel (Streamable HTTP)

Same model as ConnectWise MCP server:

```typescript
// app/api/mcp/route.ts
import { createMcpHandler } from 'mcp-handler';

const handler = createMcpHandler((server) => {
  registerTools(server, config);
}, {}, { basePath: '/api' });

// Auth handled by our Ring 2, not mcp-handler's withMcpAuth
export { handler as GET, handler as POST, handler as DELETE };
```

**MCP client configuration:**
```json
{
  "mcpServers": {
    "neon": {
      "url": "https://your-neon-mcp.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer tok_dev_abc123"
      }
    }
  }
}
```

Works from Claude Desktop, Claude Code, Claude on phone -- anywhere that supports Streamable HTTP.

### Multi-Deployment Model

Template repo. Each user/team that wants their own:
1. Fork or create from template
2. Connect to Vercel
3. Set env vars (Neon API key + MCP auth tokens)
4. Deploy

---

## 8. Project Structure

```
mcp-neon/
├── app/
│   └── api/
│       └── mcp/
│           └── route.ts          # MCP handler entry point
├── src/
│   ├── config.ts                 # Environment-driven configuration
│   ├── security/
│   │   ├── auth.ts               # Token-to-profile mapping
│   │   ├── rbac.ts               # Profile-based access control
│   │   ├── write-gates.ts        # Dry-run, confirm, blackout windows
│   │   └── audit.ts              # Structured audit logging
│   ├── tools/
│   │   ├── registry.ts           # OpenAPI-driven tool generation
│   │   ├── schema.ts             # AJV schema builder
│   │   └── defaults.ts           # Safe defaults injection
│   ├── http/
│   │   ├── client.ts             # HTTP client with retry + backoff
│   │   └── redactor.ts           # Log redaction
│   └── types/
│       └── index.ts              # Shared TypeScript types
├── spec/
│   └── neon-v2.json              # Bundled Neon OpenAPI spec
├── tests/
│   ├── security/
│   ├── tools/
│   └── http/
├── docs/
│   └── plans/
├── next.config.js
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example
└── .gitignore
```

---

## 9. Configuration

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `NEON_API_KEY` | Neon API key (Bearer token for Neon API calls) | `napi_abc123...` |
| `MCP_AUTH_TOKENS` | JSON array of `{token, profile, label}` -- maps MCP client tokens to RBAC profiles. Server refuses to start if missing. | See Ring 2 |

### Optional (Security)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEON_PROFILES` | (see defaults) | JSON: profile name >> prefix arrays |
| `NEON_ALLOWED_IPS` | (none) | Comma-separated CIDR ranges |
| `NEON_ALLOWED_OPERATIONS` | (read-only defaults) | JSON: array of {method, pathPattern} |
| `NEON_WRITE_ALLOWLIST` | `[]` | JSON: array of {method, pathPattern} |
| `NEON_BLACKOUT_WINDOWS` | `[]` | JSON: array of `{start, end, tz}` |
| `NEON_REQUIRE_CONFIRM_WRITES` | `true` | Require confirm=true for writes |
| `NEON_ENABLE_DRY_RUN` | `true` | Enable dry-run previews |

### Optional (Operational)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEON_DEFAULT_LIMIT` | `50` | Default result limit |
| `NEON_MAX_LIMIT` | `100` | Max result limit |
| `NEON_REQUEST_TIMEOUT_MS` | `30000` | HTTP request timeout |
| `NEON_LOG_LEVEL` | `info` | Logging level |
| `NEON_MAX_RESPONSE_BYTES` | `50000` | Max response payload before truncation |

---

## 10. Default Allowed Operations

Read-only by default:

```json
[
  { "method": "get", "pathPattern": "^/projects$" },
  { "method": "get", "pathPattern": "^/projects/shared$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/advisors$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/connection_uri$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/branches$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/branches/count$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/branches/[^/]+$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/branches/[^/]+/schema$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/branches/[^/]+/compare_schema$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/branches/[^/]+/endpoints$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/branches/[^/]+/databases$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/branches/[^/]+/databases/[^/]+$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/branches/[^/]+/roles$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/branches/[^/]+/roles/[^/]+$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/endpoints$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/endpoints/[^/]+$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/operations$" },
  { "method": "get", "pathPattern": "^/projects/[^/]+/operations/[^/]+$" },
  { "method": "get", "pathPattern": "^/consumption_history/account$" },
  { "method": "get", "pathPattern": "^/consumption_history/projects$" },
  { "method": "get", "pathPattern": "^/regions$" },
  { "method": "get", "pathPattern": "^/api_keys$" }
]
```

Default write allowlist (opt-in only):

```json
[
  { "method": "post", "pathPattern": "^/projects/[^/]+/branches$" },
  { "method": "delete", "pathPattern": "^/projects/[^/]+/branches/[^/]+$" },
  { "method": "post", "pathPattern": "^/projects/[^/]+/endpoints/[^/]+/start$" },
  { "method": "post", "pathPattern": "^/projects/[^/]+/endpoints/[^/]+/suspend$" }
]
```

Only branch creation/deletion and endpoint start/suspend are writable by default. Safe operations for a developer workflow.

---

## 11. Framework Validation Checklist

This proof of concept must validate these patterns before they're used in the ConnectWise server:

- [ ] Token-to-profile RBAC with `MCP_AUTH_TOKENS`
- [ ] OpenAPI-driven tool generation with semantic prefixes
- [ ] Lazy-load + module-scope spec caching
- [ ] Write gates (dry-run, confirm, blackout)
- [ ] Audit trail with tokenLabel attribution
- [ ] Streamable HTTP on Vercel via mcp-handler
- [ ] AJV input validation from OpenAPI schemas
- [ ] In-memory rate limiting (min interval throttle)
- [ ] Error mapping (Neon errors >> safe MCP responses)
- [ ] Response truncation for large result sets
- [ ] Claude Desktop + Claude Code + Claude mobile connectivity
