import { describe, it, expect } from "vitest";
import { redact } from "@/http/redactor";

describe("redact", () => {
  it("redacts authorization headers", () => {
    const obj = { authorization: "Bearer secret-token", other: "value" };
    const result = redact(obj);
    expect(result.authorization).toBe("[REDACTED]");
    expect(result.other).toBe("value");
  });

  it("redacts nested password fields", () => {
    const obj = { user: { password: "super-secret", name: "alice" } };
    const result = redact(obj);
    expect(result.user.password).toBe("[REDACTED]");
    expect(result.user.name).toBe("alice");
  });

  it("redacts token and api_key fields", () => {
    const obj = { token: "my-token", api_key: "my-api-key", data: "safe" };
    const result = redact(obj);
    expect(result.token).toBe("[REDACTED]");
    expect(result.api_key).toBe("[REDACTED]");
    expect(result.data).toBe("safe");
  });

  it("does not mutate the original object", () => {
    const obj = { authorization: "Bearer secret", nested: { password: "pass123" } };
    const original = JSON.parse(JSON.stringify(obj));
    redact(obj);
    expect(obj).toEqual(original);
  });
});
