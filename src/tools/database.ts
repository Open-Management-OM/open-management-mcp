import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Pool } from "pg";
import { createAuditLogger } from "@/security/audit";
import { truncateResponse } from "@/http/truncate";
import type { AuthContext, AppConfig } from "@/types";
import { isAllowed } from "@/security/rbac";

// Dangerous SQL keywords that could modify data or schema
const FORBIDDEN_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|MERGE)\b/i,
  /\b(GRANT|REVOKE|COPY)\b/i,
  /\b(EXECUTE|EXEC)\b/i,
  /\bINTO\s+OUTFILE\b/i,
  /\bLOAD\s+DATA\b/i,
  /;\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)/i, // multi-statement attempts
];

// Only allow SELECT and read-only commands
const ALLOWED_STARTS = [
  /^\s*SELECT\b/i,
  /^\s*WITH\b/i, // CTEs
  /^\s*EXPLAIN\b/i,
  /^\s*SHOW\b/i,
];

export function isReadOnly(sql: string): { safe: boolean; reason?: string } {
  // Strip comments
  const cleaned = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();

  // Must start with an allowed keyword
  const startsValid = ALLOWED_STARTS.some((pattern) => pattern.test(cleaned));
  if (!startsValid) {
    return { safe: false, reason: "Query must start with SELECT, WITH, EXPLAIN, or SHOW." };
  }

  // Check for forbidden patterns anywhere in the query
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(cleaned)) {
      return { safe: false, reason: `Query contains forbidden keyword: ${cleaned.match(pattern)?.[1] || "unknown"}` };
    }
  }

  return { safe: true };
}

const MAX_ROWS = 100;
export function registerDatabaseTools(server: McpServer, databaseUrl: string, getAuthContext: () => AuthContext, config?: AppConfig): void {
  const audit = createAuditLogger();
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    ssl: { rejectUnauthorized: false },
  });

  // Force read-only at the connection level
  pool.on("connect", (client) => {
    client.query("SET default_transaction_read_only = ON;");
  });

  server.tool(
    "describe_schema",
    `List tables and columns in the database. Always call this FIRST before writing any SQL -- never guess table or column names.

EFFICIENCY RULES:
- Filter by table name when the user mentions a specific entity (e.g. "tickets" -> table: "tickets")
- Only describe the full schema if the user asks "what's in the database" or you truly don't know which table to use
- Once you know the schema, don't call this again in the same conversation`,
    {
      schema: z.string().optional().describe("Schema name to filter (default: public)"),
      table: z.string().optional().describe("Table name to filter"),
    },
    async (params) => {
      // RBAC check: database tools are reporting:read
      if (config?.roles) {
        const auth = getAuthContext();
        if (!isAllowed("reporting", "read", auth.profile, config.roles)) {
          audit.log({
            action: "access_denied",
            tool: "describe_schema",
            profile: auth.profile,
            tokenLabel: auth.label,
            result: "denied",
          });
          return {
            content: [{ type: "text" as const, text: `Access denied: '${auth.profile}' cannot read reporting resources` }],
            isError: true,
          };
        }
      }

      const schemaName = (params as Record<string, unknown>).schema as string || "public";
      const tableName = (params as Record<string, unknown>).table as string | undefined;

      let query = `
        SELECT
          t.table_schema,
          t.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          c.character_maximum_length
        FROM information_schema.tables t
        JOIN information_schema.columns c
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE t.table_schema = $1
          AND t.table_type = 'BASE TABLE'
      `;
      const queryParams: string[] = [schemaName];

      if (tableName) {
        query += " AND t.table_name = $2";
        queryParams.push(tableName);
      }

      query += " ORDER BY t.table_name, c.ordinal_position";

      try {
        const result = await pool.query(query, queryParams);

        const auth = getAuthContext();
        audit.log({
          action: "tool_call",
          tool: "describe_schema",
          profile: auth.profile,
          tokenLabel: auth.label,
          result: "success",
        });

        if (result.rows.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No tables found in schema "${schemaName}"${tableName ? ` matching "${tableName}"` : ""}.` }],
          };
        }

        // Group by table for readability
        const tables: Record<string, Array<Record<string, unknown>>> = {};
        for (const row of result.rows) {
          const name = row.table_name;
          if (!tables[name]) tables[name] = [];
          tables[name].push({
            column: row.column_name,
            type: row.data_type,
            nullable: row.is_nullable === "YES",
            default: row.column_default,
            maxLength: row.character_maximum_length,
          });
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(tables, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const errAuth = getAuthContext();
        audit.log({
          action: "tool_call",
          tool: "describe_schema",
          profile: errAuth.profile,
          tokenLabel: errAuth.label,
          result: "error",
          errorCode: "QUERY_FAILED",
        });
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
        };
      }
    }
  );

  server.tool(
    "run_sql",
    `Execute a read-only SQL query (SELECT only). Max 100 rows returned, 50KB response limit.

BEFORE QUERYING -- ask the user to narrow their request:
- Time range? (e.g. "last 7 days", "this month", "2025")
- Specific client/customer/account?
- Status filter? (open, closed, in progress)
- Any other criteria that reduces the result set?

EFFICIENCY RULES:
- Always use WHERE clauses. Never SELECT * FROM large_table without filters.
- Use COUNT(*) first if the user asks "how many" -- don't fetch all rows just to count.
- Select only the columns you need, not SELECT *.
- Use LIMIT even if you have filters. Start with 10-25 rows, ask if user wants more.
- For aggregation questions (totals, averages, trends), use GROUP BY in SQL -- don't fetch raw rows and calculate yourself.
- If a query returns 100 rows (the max), tell the user the results may be incomplete and suggest narrower filters.`,
    {
      sql: z.string().describe("The SQL query to execute (SELECT only)"),
    },
    async (params) => {
      // RBAC check: database tools are reporting:read
      if (config?.roles) {
        const auth = getAuthContext();
        if (!isAllowed("reporting", "read", auth.profile, config.roles)) {
          audit.log({
            action: "access_denied",
            tool: "run_sql",
            profile: auth.profile,
            tokenLabel: auth.label,
            result: "denied",
          });
          return {
            content: [{ type: "text" as const, text: `Access denied: '${auth.profile}' cannot read reporting resources` }],
            isError: true,
          };
        }
      }

      const sql = (params as Record<string, unknown>).sql as string;

      // Validate read-only
      const check = isReadOnly(sql);
      if (!check.safe) {
        const denyAuth = getAuthContext();
        audit.log({
          action: "access_denied",
          tool: "run_sql",
          profile: denyAuth.profile,
          tokenLabel: denyAuth.label,
          result: "denied",
          errorCode: "WRITE_BLOCKED",
        });
        return {
          content: [{ type: "text" as const, text: `Blocked: ${check.reason}` }],
        };
      }

      try {
        // Add LIMIT if not present
        const hasLimit = /\bLIMIT\b/i.test(sql);
        const safeSql = hasLimit ? sql : `${sql.replace(/;\s*$/, "")} LIMIT ${MAX_ROWS}`;

        const result = await pool.query(safeSql);

        const sqlAuth = getAuthContext();
        audit.log({
          action: "tool_call",
          tool: "run_sql",
          profile: sqlAuth.profile,
          tokenLabel: sqlAuth.label,
          result: "success",
        });

        const output = {
          rows: result.rows,
          rowCount: result.rowCount,
          fields: result.fields.map((f) => ({ name: f.name, dataType: f.dataTypeID })),
        };

        return {
          content: [{ type: "text" as const, text: truncateResponse(JSON.stringify(output, null, 2)) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const sqlErrAuth = getAuthContext();
        audit.log({
          action: "tool_call",
          tool: "run_sql",
          profile: sqlErrAuth.profile,
          tokenLabel: sqlErrAuth.label,
          result: "error",
          errorCode: "QUERY_FAILED",
        });
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
        };
      }
    }
  );
}
