import { describe, it, expect } from "vitest";
import { generateToolDefinitions } from "@/tools/registry";
import type { OperationPattern, OpenAPISpec } from "@/types";
import specJson from "../../spec/neon-v2.json";

const spec = specJson as unknown as OpenAPISpec;

const smallAllowedOps: OperationPattern[] = [
  { method: "get", pathPattern: "^/projects$" },
  { method: "get", pathPattern: "^/projects/[^/]+$" },
  { method: "get", pathPattern: "^/projects/[^/]+/branches$" },
  { method: "get", pathPattern: "^/projects/[^/]+/branches/[^/]+$" },
  { method: "get", pathPattern: "^/regions$" },
];

const defaultAllowedOps: OperationPattern[] = [
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

describe("generateToolDefinitions", () => {
  it("generates tools from spec (length > 0)", () => {
    const tools = generateToolDefinitions(spec, smallAllowedOps);
    expect(tools.length).toBeGreaterThan(0);
  });

  it("only generates tools matching allowed operations (no write methods when only GET patterns)", () => {
    const tools = generateToolDefinitions(spec, smallAllowedOps);
    for (const tool of tools) {
      expect(tool.method).toBe("get");
    }
    // Verify we only get paths that match the patterns
    const paths = tools.map((t) => t.path);
    for (const p of paths) {
      const matched = smallAllowedOps.some((op) => new RegExp(op.pathPattern).test(p));
      expect(matched).toBe(true);
    }
  });

  it("assigns semantic prefix proj- for /projects paths", () => {
    const tools = generateToolDefinitions(spec, smallAllowedOps);
    const projectTool = tools.find((t) => t.path === "/projects");
    expect(projectTool).toBeDefined();
    expect(projectTool!.prefix).toBe("proj-");
    expect(projectTool!.name).toMatch(/^proj-/);
  });

  it("assigns semantic prefix branch- for branches paths", () => {
    const tools = generateToolDefinitions(spec, smallAllowedOps);
    const branchTool = tools.find((t) => t.path === "/projects/{project_id}/branches");
    expect(branchTool).toBeDefined();
    expect(branchTool!.prefix).toBe("branch-");
    expect(branchTool!.name).toMatch(/^branch-/);
  });

  it("assigns semantic prefix region- for /regions path", () => {
    const tools = generateToolDefinitions(spec, [
      { method: "get", pathPattern: "^/regions$" },
    ]);
    const regionTool = tools.find((t) => t.path === "/regions");
    expect(regionTool).toBeDefined();
    expect(regionTool!.prefix).toBe("region-");
    expect(regionTool!.name).toMatch(/^region-/);
  });

  it("extracts path parameters (project_id, branch_id)", () => {
    const tools = generateToolDefinitions(spec, smallAllowedOps);
    const branchTool = tools.find((t) => t.path === "/projects/{project_id}/branches/{branch_id}");
    expect(branchTool).toBeDefined();
    expect(branchTool!.pathParams).toContain("project_id");
    expect(branchTool!.pathParams).toContain("branch_id");
  });

  it("generates tool names from operationId when present", () => {
    const tools = generateToolDefinitions(spec, smallAllowedOps);
    // All tools with an operationId in the spec should use it in the name
    for (const tool of tools) {
      // Names should be non-empty strings
      expect(tool.name).toBeTruthy();
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
    }
    // The /projects GET should have a name derived from its operationId
    const projectTool = tools.find((t) => t.path === "/projects" && t.method === "get");
    expect(projectTool).toBeDefined();
    // Name should start with prefix
    expect(projectTool!.name).toMatch(/^proj-/);
  });

  it("includes description from summary", () => {
    const tools = generateToolDefinitions(spec, smallAllowedOps);
    const projectTool = tools.find((t) => t.path === "/projects" && t.method === "get");
    expect(projectTool).toBeDefined();
    expect(projectTool!.description).toBeTruthy();
    expect(typeof projectTool!.description).toBe("string");
    expect(projectTool!.description.length).toBeGreaterThan(0);
  });

  it("stays within 128 tool limit when using the full default allowlist (all 23 GET patterns)", () => {
    const tools = generateToolDefinitions(spec, defaultAllowedOps);
    expect(tools.length).toBeLessThanOrEqual(128);
    expect(tools.length).toBeGreaterThan(0);
  });

  it("throws when tool count exceeds 128 (using pathPattern .* to match everything)", () => {
    const catchAllOps: OperationPattern[] = [
      { method: "get", pathPattern: ".*" },
      { method: "post", pathPattern: ".*" },
      { method: "put", pathPattern: ".*" },
      { method: "patch", pathPattern: ".*" },
      { method: "delete", pathPattern: ".*" },
    ];
    expect(() => generateToolDefinitions(spec, catchAllOps)).toThrow(/128/);
  });
});
