import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AuthContext, ToolDefinition, AppConfig, OpenAPIParam } from "@/types";
import { NeonClient } from "@/http/client";
import { createAuditLogger } from "@/security/audit";
import { truncateResponse } from "@/http/truncate";
import { classifyPrefix } from "@/security/categories";
import { isAllowed, methodToVerb } from "@/security/rbac";

type ZodShape = Record<string, z.ZodTypeAny>;

function mapOpenAPITypeToZod(param: OpenAPIParam): z.ZodTypeAny {
  const schema = param.schema;
  const type = schema.type as string | undefined;

  let zodType: z.ZodTypeAny;

  switch (type) {
    case "integer":
      zodType = z.number().int();
      break;
    case "number":
      zodType = z.number();
      break;
    case "boolean":
      zodType = z.boolean();
      break;
    case "array":
      zodType = z.array(z.string());
      break;
    default:
      zodType = z.string();
  }

  if (!param.required) {
    zodType = zodType.optional();
  }

  return zodType;
}

function buildZodSchema(tool: ToolDefinition): ZodShape {
  const shape: ZodShape = {};

  // Path params are always required strings
  for (const param of tool.pathParams) {
    shape[param] = z.string();
  }

  // Query params typed from OpenAPI schema
  for (const param of tool.queryParams) {
    shape[param.name] = mapOpenAPITypeToZod(param);
  }

  // Write operations get body and confirm
  if (tool.method.toLowerCase() !== "get") {
    shape["body"] = z.record(z.string(), z.unknown()).optional();
    shape["confirm"] = z.boolean().optional();
  }

  return shape;
}

function resolvePathParams(path: string, params: Record<string, unknown>): string {
  return path.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = params[key];
    if (value === undefined || value === null) {
      throw new Error(`Missing required path parameter: ${key}`);
    }
    return String(value);
  });
}

function buildQueryParams(tool: ToolDefinition, params: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const qp of tool.queryParams) {
    const value = params[qp.name];
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        query[qp.name] = value.join(",");
      } else {
        query[qp.name] = String(value);
      }
    }
  }
  return query;
}


export function registerTools(
  server: McpServer,
  tools: ToolDefinition[],
  config: AppConfig,
  neonClient: NeonClient,
  getAuthContext: () => AuthContext
): void {
  const audit = createAuditLogger();

  for (const tool of tools) {
    const zodSchema = buildZodSchema(tool);
    const isWrite = tool.method.toLowerCase() !== "get";

    server.tool(tool.name, tool.description, zodSchema, async (params) => {
      const typedParams = params as Record<string, unknown>;
      const auth = getAuthContext();
      const tokenLabel = auth.label;
      const profile = auth.profile;

      // RBAC check: category:verb
      const category = classifyPrefix(tool.prefix);
      const verb = methodToVerb(tool.method);
      if (!isAllowed(category, verb, profile, config.roles)) {
        audit.log({
          action: "access_denied",
          tool: tool.name,
          profile,
          tokenLabel,
          result: "denied",
        });
        return {
          content: [{ type: "text" as const, text: `Access denied: '${profile}' cannot ${verb} ${category} resources` }],
          isError: true,
        };
      }

      // Execute the request
      let resolvedPath: string;
      try {
        resolvedPath = resolvePathParams(tool.path, typedParams);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        audit.log({
          action: "tool_call",
          tool: tool.name,
          method: tool.method,
          path: tool.path,
          profile,
          tokenLabel,
          result: "error",
          errorCode: "PATH_PARAM_ERROR",
        });
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
        };
      }

      const query = buildQueryParams(tool, typedParams);
      const body = isWrite ? (typedParams["body"] as Record<string, unknown> | undefined) : undefined;

      try {
        const response = await neonClient.request(tool.method, resolvedPath, {
          body,
          query: Object.keys(query).length > 0 ? query : undefined,
        });

        const responseText = JSON.stringify(response.data, null, 2);
        const truncated = truncateResponse(responseText, config.maxResponseBytes);

        audit.log({
          action: "tool_call",
          tool: tool.name,
          method: tool.method,
          path: resolvedPath,
          profile,
          tokenLabel,
          result: "success",
        });

        return {
          content: [{ type: "text" as const, text: truncated }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        audit.log({
          action: "tool_call",
          tool: tool.name,
          method: tool.method,
          path: resolvedPath,
          profile,
          tokenLabel,
          result: "error",
          errorCode: "REQUEST_FAILED",
        });
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
        };
      }
    });
  }
}
