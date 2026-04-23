import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { expect } from "vitest";

export interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export interface McpTestHarness {
  /** List all registered tool names */
  listTools(): string[];
  /** Call a tool by name with arguments, returns the tool result */
  callTool(name: string, args?: Record<string, unknown>): Promise<ToolResult>;
  /** Assert a tool exists */
  assertToolExists(name: string): void;
  /** Assert a tool does NOT exist */
  assertToolMissing(name: string): void;
  /** Get the server instance for advanced use */
  server: McpServer;
}

/**
 * Access the internal _registeredTools map from an McpServer instance.
 * The SDK marks it as private, so we use a type assertion to reach it.
 */
function getRegisteredTools(
  server: McpServer
): Record<
  string,
  {
    enabled: boolean;
    inputSchema?: unknown;
    handler: ((...args: unknown[]) => unknown) | { createTask: (...args: unknown[]) => unknown };
  }
> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (server as any)._registeredTools;
}

/**
 * Create a test harness for an MCP server.
 * Registers tools via the provided setup function, then exposes
 * a simple API for calling tools and asserting results.
 */
export async function createTestHarness(
  setup: (server: McpServer) => void | Promise<void>
): Promise<McpTestHarness> {
  const server = new McpServer({ name: "test-server", version: "0.0.0" });

  await setup(server);

  const harness: McpTestHarness = {
    server,

    listTools(): string[] {
      return Object.keys(getRegisteredTools(server));
    },

    async callTool(name: string, args?: Record<string, unknown>): Promise<ToolResult> {
      const tools = getRegisteredTools(server);
      const tool = tools[name];
      if (!tool) {
        throw new Error(`Tool "${name}" is not registered`);
      }
      if (!tool.enabled) {
        throw new Error(`Tool "${name}" is disabled`);
      }

      // Build a minimal RequestHandlerExtra-like object for the handler
      const extra = {
        signal: new AbortController().signal,
        sessionId: undefined,
        sendNotification: async () => {},
        sendRequest: async () => ({}),
        authInfo: undefined,
        requestId: "test",
      };

      let result: ToolResult;
      if (tool.inputSchema) {
        // Handler expects (parsedArgs, extra)
        const handler = tool.handler as (args: unknown, extra: unknown) => Promise<ToolResult>;
        result = await handler(args ?? {}, extra);
      } else {
        // Handler expects just (extra)
        const handler = tool.handler as (extra: unknown) => Promise<ToolResult>;
        result = await handler(extra);
      }

      return result;
    },

    assertToolExists(name: string): void {
      const tools = getRegisteredTools(server);
      expect(tools[name], `Expected tool "${name}" to be registered`).toBeDefined();
    },

    assertToolMissing(name: string): void {
      const tools = getRegisteredTools(server);
      expect(tools[name], `Expected tool "${name}" to NOT be registered`).toBeUndefined();
    },
  };

  return harness;
}
