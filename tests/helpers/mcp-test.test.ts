import { describe, it, expect } from "vitest";
import { createTestHarness } from "./mcp-test";
import { z } from "zod";

describe("McpTestHarness", () => {
  it("registers and lists tools", async () => {
    const harness = await createTestHarness((server) => {
      server.tool("echo", "Echo input", { message: z.string() }, async ({ message }) => ({
        content: [{ type: "text", text: String(message) }],
      }));
    });
    expect(harness.listTools()).toContain("echo");
  });

  it("calls a tool and returns the result", async () => {
    const harness = await createTestHarness((server) => {
      server.tool("greet", "Greet someone", { name: z.string() }, async ({ name }) => ({
        content: [{ type: "text", text: `Hello, ${name}!` }],
      }));
    });
    const result = await harness.callTool("greet", { name: "Matt" });
    expect(result.content[0].text).toBe("Hello, Matt!");
  });

  it("calls a tool with no arguments", async () => {
    const harness = await createTestHarness((server) => {
      server.tool("ping", "Ping", {}, async () => ({
        content: [{ type: "text", text: "pong" }],
      }));
    });
    const result = await harness.callTool("ping");
    expect(result.content[0].text).toBe("pong");
  });

  it("throws when calling an unregistered tool", async () => {
    const harness = await createTestHarness(() => {});
    await expect(harness.callTool("nope")).rejects.toThrow('Tool "nope" is not registered');
  });

  it("assertToolExists passes for registered tool", async () => {
    const harness = await createTestHarness((server) => {
      server.tool("ping", "Ping", {}, async () => ({
        content: [{ type: "text", text: "pong" }],
      }));
    });
    expect(() => harness.assertToolExists("ping")).not.toThrow();
  });

  it("assertToolExists throws for missing tool", async () => {
    const harness = await createTestHarness(() => {});
    expect(() => harness.assertToolExists("missing")).toThrow();
  });

  it("assertToolMissing passes for unregistered tool", async () => {
    const harness = await createTestHarness(() => {});
    expect(() => harness.assertToolMissing("ghost")).not.toThrow();
  });

  it("assertToolMissing throws for registered tool", async () => {
    const harness = await createTestHarness((server) => {
      server.tool("exists", "Exists", {}, async () => ({
        content: [{ type: "text", text: "here" }],
      }));
    });
    expect(() => harness.assertToolMissing("exists")).toThrow();
  });

  it("lists multiple tools", async () => {
    const harness = await createTestHarness((server) => {
      server.tool("alpha", "Alpha", {}, async () => ({
        content: [{ type: "text", text: "a" }],
      }));
      server.tool("beta", "Beta", {}, async () => ({
        content: [{ type: "text", text: "b" }],
      }));
    });
    const tools = harness.listTools();
    expect(tools).toContain("alpha");
    expect(tools).toContain("beta");
    expect(tools).toHaveLength(2);
  });

  it("exposes the server instance for advanced use", async () => {
    const harness = await createTestHarness(() => {});
    expect(harness.server).toBeDefined();
  });
});
