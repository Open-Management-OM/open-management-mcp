import type { OperationPattern, ToolDefinition, OpenAPISpec, OpenAPIParam, OpenAPIOperation } from "@/types";

const PREFIX_MAP: Record<string, string> = {
  projects: "proj-",
  branches: "branch-",
  endpoints: "ep-",
  databases: "db-",
  roles: "role-",
  operations: "op-",
  consumption_history: "consumption-",
  regions: "region-",
  api_keys: "apikey-",
  organizations: "org-",
  snapshots: "snapshot-",
};

function derivePrefix(path: string): string {
  const segments = path.split("/").filter(Boolean).filter((s) => !s.startsWith("{"));
  // Walk from end to find most specific match
  for (let i = segments.length - 1; i >= 0; i--) {
    if (PREFIX_MAP[segments[i]]) return PREFIX_MAP[segments[i]];
  }
  return PREFIX_MAP[segments[0]] || "misc-";
}

function deriveToolName(operationId: string | undefined, method: string, path: string, prefix: string): string {
  if (operationId) return `${prefix}${operationId}`;
  const segments = path
    .split("/")
    .filter(Boolean)
    .filter((s) => !s.startsWith("{"))
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  return `${prefix}${method}${segments}`;
}

function isOperationAllowed(method: string, path: string, allowedOperations: OperationPattern[]): boolean {
  return allowedOperations.some(
    (pattern) => pattern.method === method.toLowerCase() && new RegExp(pattern.pathPattern).test(path)
  );
}

function extractPathParams(path: string): string[] {
  const matches = path.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

export function generateToolDefinitions(spec: OpenAPISpec, allowedOperations: OperationPattern[]): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      if (!isOperationAllowed(method, path, allowedOperations)) continue;

      const op = operation as OpenAPIOperation;
      const prefix = derivePrefix(path);
      const name = deriveToolName(op.operationId, method, path, prefix);
      const description = op.summary || op.description || `${method.toUpperCase()} ${path}`;
      const pathParams = extractPathParams(path);
      const queryParams: OpenAPIParam[] = (op.parameters || []).filter((p) => p.in === "query");

      tools.push({ name, description, method, path, pathParams, queryParams, requestBody: op.requestBody, prefix });
    }
  }

  if (tools.length > 128) {
    throw new Error(`Tool count ${tools.length} exceeds MCP limit of 128`);
  }
  if (tools.length > 80) {
    console.warn(`WARNING: Generated ${tools.length} tools, approaching MCP limit.`);
  }

  return tools;
}
