import { describe, it, expect, vi } from "vitest";
import { createAuditLogger } from "@/security/audit";

describe("createAuditLogger", () => {
  it("emits structured JSON with audit: true field", () => {
    const lines: string[] = [];
    const logger = createAuditLogger((line) => lines.push(line));

    logger.log({
      action: "tool_call",
      profile: "developer",
      tokenLabel: "dev-token",
      result: "success",
    });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.audit).toBe(true);
  });

  it("includes a timestamp in ISO format", () => {
    const lines: string[] = [];
    const logger = createAuditLogger((line) => lines.push(line));

    logger.log({
      action: "tool_call",
      profile: "developer",
      tokenLabel: "dev-token",
      result: "success",
    });

    const parsed = JSON.parse(lines[0]);
    expect(parsed.timestamp).toBeDefined();
    expect(() => new Date(parsed.timestamp)).not.toThrow();
    expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
  });

  it("logs tool_call action correctly", () => {
    const lines: string[] = [];
    const logger = createAuditLogger((line) => lines.push(line));

    logger.log({
      action: "tool_call",
      tool: "proj-list",
      profile: "developer",
      tokenLabel: "dev-token",
      result: "success",
    });

    const parsed = JSON.parse(lines[0]);
    expect(parsed.action).toBe("tool_call");
    expect(parsed.tool).toBe("proj-list");
    expect(parsed.profile).toBe("developer");
    expect(parsed.tokenLabel).toBe("dev-token");
    expect(parsed.result).toBe("success");
  });

  it("logs auth_failure action correctly", () => {
    const lines: string[] = [];
    const logger = createAuditLogger((line) => lines.push(line));

    logger.log({
      action: "auth_failure",
      profile: "unknown",
      tokenLabel: "invalid",
      result: "denied",
    });

    const parsed = JSON.parse(lines[0]);
    expect(parsed.action).toBe("auth_failure");
    expect(parsed.result).toBe("denied");
  });

  it("never includes sensitive fields like napi_, Bearer, or password", () => {
    const lines: string[] = [];
    const logger = createAuditLogger((line) => lines.push(line));

    logger.log({
      action: "tool_call",
      profile: "developer",
      tokenLabel: "dev-token",
      result: "success",
    });

    const raw = lines[0];
    expect(raw).not.toMatch(/napi_/);
    expect(raw).not.toMatch(/Bearer/);
    expect(raw).not.toMatch(/password/);
  });

  it("uses process.stdout.write when no sink is provided", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logger = createAuditLogger();

    logger.log({
      action: "tool_call",
      profile: "developer",
      tokenLabel: "dev-token",
      result: "success",
    });

    expect(writeSpy).toHaveBeenCalled();
    const written = writeSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trimEnd());
    expect(parsed.audit).toBe(true);
    writeSpy.mockRestore();
  });
});
