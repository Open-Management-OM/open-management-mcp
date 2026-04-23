import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createAuditLogger } from "@/security/audit";
import { isAllowed } from "@/security/rbac";
import type { AuthContext, AppConfig } from "@/types";
import { WAREHOUSE_GUIDE } from "@/warehouse-guide";

export function registerWarehouseTools(
  server: McpServer,
  getAuthContext: () => AuthContext,
  config?: AppConfig,
): void {
  const audit = createAuditLogger();

  server.tool(
    "get_warehouse_guide",
    `Return the warehouse guide. Call this FIRST when you need to write SQL against this database.

The guide documents tables, business-term definitions (e.g. "active customer", "reactive ticket"), pre-computed columns to use vs re-derive, common query patterns, and anti-patterns to avoid.

EFFICIENCY RULES:
- Call this ONCE per conversation before your first SQL query. The content is stable within a session.
- If the guide answers the user's question directly (table name, column meaning, business definition), use it instead of describe_schema or run_sql to explore.
- If the guide contains a pre-computed column or an exact SQL pattern for the question, use it verbatim -- never re-derive.`,
    {},
    async () => {
      if (config?.roles) {
        const auth = getAuthContext();
        if (!isAllowed("reporting", "read", auth.profile, config.roles)) {
          audit.log({
            action: "access_denied",
            tool: "get_warehouse_guide",
            profile: auth.profile,
            tokenLabel: auth.label,
            result: "denied",
            errorCode: "rbac_denied",
          });
          return {
            content: [{ type: "text", text: "Access denied: your role cannot read the warehouse guide." }],
            isError: true,
          };
        }

        audit.log({
          action: "tool_call",
          tool: "get_warehouse_guide",
          profile: auth.profile,
          tokenLabel: auth.label,
          result: "success",
        });
      }

      return {
        content: [{ type: "text", text: WAREHOUSE_GUIDE }],
      };
    },
  );
}
