# AI Agent Instructions

**If you are an AI assistant (Claude, GPT, Copilot, etc.) that has been asked to fork this repo and create an MCP server for a new API-- this file is for you.**

You don't need to understand the MCP protocol, the auth layer, or the RBAC engine. Those are already built. You need to do exactly 8 things, in order, and you'll have a working MCP server.

---

## What This Repo Is

A reusable framework for exposing any REST API as an MCP server (Model Context Protocol). It auto-generates tools from an OpenAPI spec, handles auth, enforces role-based access control, and logs everything. You're wiring it to a new data source.

## What You're NOT Touching

Do not modify these. They're generic and already work:

- `src/security/` -- Auth, RBAC, JWT, audit logging, categories
- `src/http/` -- HTTP client, redactor, truncation, HTML helpers
- `app/api/oauth/` -- OAuth flow (Google + Microsoft SSO)
- `app/.well-known/` -- OAuth discovery
- `tests/helpers/` -- Test harness
- `tests/security/` -- Security tests
- `tests/http/` -- HTTP tests

## The 8 Things You Do

### 1. Replace the OpenAPI Spec

Delete the Neon spec. Drop in the new one.

```bash
rm spec/neon-v2.json
cp /path/to/new-api-spec.json spec/new-api.json
```

The spec MUST be OpenAPI v3.x in JSON format. If the user gives you a YAML spec, convert it to JSON first.

### 2. Update the Spec Import

Open `app/api/[transport]/route.ts`. Find the line that imports the spec:

```typescript
import spec from "../../../../spec/neon-v2.json";
```

Change it to your new spec filename:

```typescript
import spec from "../../../../spec/new-api.json";
```

### 3. Update PREFIX_MAP

Open `src/tools/registry.ts`. Find `PREFIX_MAP`. Replace it with prefixes that match the new API's URL path segments.

The keys are the URL path segments from the OpenAPI spec. The values are short prefixes for tool names.

**How to derive prefixes:** Look at the `paths` in the OpenAPI spec. For each unique resource noun in the URL, create a prefix:

```
/v1/tickets/{id}          >> tickets: "ticket-"
/v1/companies/{id}        >> companies: "company-"
/v2/contacts/{id}         >> contacts: "contact-"
/v1/invoices/{id}         >> invoices: "invoice-"
/admin/settings            >> settings: "setting-"
```

Keep prefixes short (5-10 chars) and consistent. Use singular form with a trailing hyphen.

### 4. Update DEFAULT_ALLOWED_OPERATIONS

Open `src/config.ts`. Find `DEFAULT_ALLOWED_OPERATIONS`. Replace with regex patterns matching the endpoints you want to expose.

**Start with read-only GET operations.** This is critical for safety. Only add POST/PUT/DELETE after the user explicitly asks for write access.

```typescript
const DEFAULT_ALLOWED_OPERATIONS: OperationPattern[] = [
  { method: "get", pathPattern: "^/v1/tickets$" },
  { method: "get", pathPattern: "^/v1/tickets/[^/]+$" },
  { method: "get", pathPattern: "^/v1/companies$" },
  { method: "get", pathPattern: "^/v1/companies/[^/]+$" },
  // Add more GET patterns as needed
];
```

The `pathPattern` is a regex matched against the path in the OpenAPI spec. Use `[^/]+` for path parameters.

### 5. Update the HTTP Client Base URL

Open `src/http/client.ts`. Find the `BASE_URL` constant. Change it to the new API's base URL:

```typescript
const BASE_URL = "https://api.newservice.com/v1";
```

Also check the auth header. If the new API uses a different header name (e.g., `X-API-Key` instead of `Authorization: Bearer`), update the `request()` method.

### 6. Update Environment Variables

In `src/config.ts`, find where `NEON_API_KEY` is read. Rename it to match the new service:

```typescript
// Before
neonApiKey: requireEnv("NEON_API_KEY"),

// After
apiKey: requireEnv("CONNECTWISE_API_KEY"),
```

Update `.env.example` to document the new variable name.

Update `MCP_AUTH_TOKENS` with tokens for the new deployment.

### 7. Run Tests and Fix

```bash
npm test
```

**Expected:** Most tests pass. You may need to update:

- `tests/integration/smoke.test.ts` -- Update the env var name and API endpoint
- `tests/tools/registry.test.ts` -- Prefix assertions will need updating
- `tests/config.test.ts` -- If you renamed the API key env var

The framework tests (auth, RBAC, JWT, categories, harness) should all pass unchanged.

### 8. Customize the Warehouse Guide

Open `src/warehouse-guide.ts`. The current content is a template with comments explaining the methodology. It's exposed to Claude as the `get_warehouse_guide` tool-- Claude calls it BEFORE writing SQL, which is how it learns about YOUR tables, business terms, and query patterns.

**You MUST replace the template with real content about the user's data.** Work with the user to:

1. List their 3-5 most-queried tables-- schema, key columns, row counts
2. Write exact definitions for critical business terms ("active customer", "reactive ticket", "profitable account" -- do not guess, ask the user)
3. Document pre-computed columns Claude should use verbatim (never re-derive)
4. Add 3-5 common query patterns as SQL examples
5. List anti-patterns the user has seen go wrong

The file has a methodology section at the top. Follow it. Don't ship a generic warehouse-guide; a generic one is worse than none because it teaches Claude wrong things about the specific warehouse.

---

## RBAC Auto-Classification

After you set up prefixes, the RBAC system auto-classifies them into categories using keyword matching. These 6 categories are universal across all SaaS APIs:

| Category | Matches prefixes containing |
|----------|-----------------------------|
| `work` | task, ticket, issue, deal, project, order, job, request, card, sprint, case, workflow |
| `people` | contact, lead, company, account, customer, client, member, user, team, employee, vendor |
| `financial` | invoice, payment, billing, charge, expense, subscription, price, quote, credit, transaction |
| `content` | document, file, email, campaign, template, page, post, message, note, form, survey |
| `config` | setting, config, webhook, integration, api_key, permission, role, automation, secret |
| `reporting` | report, analytics, dashboard, export, metric, stat, summary, log, audit, usage |

If a prefix doesn't match any keyword, it becomes `uncategorized` and only the `admin` role can access it. To fix: add a keyword to `CATEGORY_HINTS` in `src/security/categories.ts`.

## 6 Default Roles

These roles are pre-configured and work for most B2B APIs:

| Role | Access |
|------|--------|
| `admin` | Everything |
| `lead` | Work (all), People (all), Content (all), Reporting (read) |
| `member` | Work (all), People (read), Content (read) |
| `finance` | Financial (all), People (read), Reporting (read) |
| `external` | Work (read), Content (read) |
| `viewer` | Everything (read-only) |

The user can customize roles via the `RBAC_PROFILES` env var.

---

## Testing Your New Server

Use the test harness to write tests for your new tools:

```typescript
import { createTestHarness } from "../helpers/mcp-test";
import { registerTools } from "@/tools/register";

const harness = await createTestHarness((server) => {
  // Register your tools here
  registerTools(server, toolDefinitions, config, httpClient, getAuthContext);
});

// Assert tools exist
harness.assertToolExists("ticket-list");
harness.assertToolMissing("secret-admin-tool");

// Call a tool
const result = await harness.callTool("ticket-list", { limit: 5 });
expect(result.content[0].text).toContain("tickets");
```

---

## Common Mistakes

1. **Don't modify the security layer.** If you think you need to change auth or RBAC, you're probably wrong. Configure it with env vars instead.

2. **Don't expose write operations by default.** Start read-only. The user will ask for writes when they're ready.

3. **Don't hardcode API credentials.** Everything goes through env vars.

4. **Don't skip the spec.** If the API doesn't have an OpenAPI spec, you can't use this framework. Help the user find or generate one first.

5. **Don't create tools manually.** The framework generates tools from the spec. If you need a custom tool, add it alongside the database tools in `src/tools/database.ts`, not by hand-coding tool registrations.

6. **Don't forget the PREFIX_MAP.** If a path segment doesn't have a prefix mapping, its tools won't get semantic names and RBAC classification won't work.

---

## File Map

```
spec/                          # YOUR OpenAPI spec goes here
src/
  config.ts                    # DEFAULT_ALLOWED_OPERATIONS, env var loading
  warehouse-guide.ts           # YOUR warehouse guide -- exposed via get_warehouse_guide tool
  types/index.ts               # TypeScript interfaces
  http/
    client.ts                  # HTTP client -- update BASE_URL + auth header
    html.ts                    # (don't touch)
    redactor.ts                # (don't touch)
    truncate.ts                # (don't touch)
  security/                    # (don't touch any of these)
    audit.ts
    auth.ts
    auth-code.ts
    categories.ts              # Add keywords here if auto-classification misses
    jwt.ts
    rbac.ts
    providers/
      google.ts
      microsoft.ts
      state.ts
  tools/
    database.ts                # SQL tools -- add custom tools here if needed
    warehouse.ts               # Registers get_warehouse_guide (don't touch; edit warehouse-guide.ts instead)
    register.ts                # OpenAPI tool registration (don't touch)
    registry.ts                # PREFIX_MAP lives here -- update this
app/
  api/
    [transport]/route.ts       # Spec import path -- update this
    oauth/                     # (don't touch)
tests/
  helpers/mcp-test.ts          # Test harness -- use this for your tests
  integration/smoke.test.ts    # Update for your API
  tools/registry.test.ts       # Update prefix assertions
```

---

**That's it.** 8 changes, run tests, deploy. Everything else is handled by the framework.
