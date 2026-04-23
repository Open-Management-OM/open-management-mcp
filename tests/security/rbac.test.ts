import { describe, it, expect } from "vitest";
import {
  isAllowed,
  resolvePermissions,
  methodToVerb,
  filterTools,
  DEFAULT_ROLES,
} from "@/security/rbac";
import type { RoleMap, FilterableTool } from "@/security/rbac";

describe("isAllowed", () => {
  it("admin can do anything", () => {
    expect(isAllowed("work", "read", "admin", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("financial", "delete", "admin", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("config", "create", "admin", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("uncategorized", "update", "admin", DEFAULT_ROLES)).toBe(true);
  });

  it("viewer can read everything but not write", () => {
    expect(isAllowed("work", "read", "viewer", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("financial", "read", "viewer", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("config", "read", "viewer", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("work", "create", "viewer", DEFAULT_ROLES)).toBe(false);
    expect(isAllowed("financial", "delete", "viewer", DEFAULT_ROLES)).toBe(false);
    expect(isAllowed("people", "update", "viewer", DEFAULT_ROLES)).toBe(false);
  });

  it("finance can read/write financial but only read people", () => {
    expect(isAllowed("financial", "read", "finance", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("financial", "create", "finance", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("financial", "update", "finance", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("financial", "delete", "finance", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("people", "read", "finance", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("people", "create", "finance", DEFAULT_ROLES)).toBe(false);
    expect(isAllowed("reporting", "read", "finance", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("work", "read", "finance", DEFAULT_ROLES)).toBe(false);
  });

  it("member can work on work items but only read people, no financial access", () => {
    expect(isAllowed("work", "read", "member", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("work", "create", "member", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("work", "update", "member", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("work", "delete", "member", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("people", "read", "member", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("people", "create", "member", DEFAULT_ROLES)).toBe(false);
    expect(isAllowed("content", "read", "member", DEFAULT_ROLES)).toBe(true);
    expect(isAllowed("content", "create", "member", DEFAULT_ROLES)).toBe(false);
    expect(isAllowed("financial", "read", "member", DEFAULT_ROLES)).toBe(false);
  });

  it("unknown role denied everything", () => {
    expect(isAllowed("work", "read", "ghost", DEFAULT_ROLES)).toBe(false);
    expect(isAllowed("financial", "create", "ghost", DEFAULT_ROLES)).toBe(false);
    expect(isAllowed("config", "delete", "nonexistent", DEFAULT_ROLES)).toBe(false);
  });

  it("uncategorized resources denied for non-admin", () => {
    expect(isAllowed("uncategorized", "read", "viewer", DEFAULT_ROLES)).toBe(true); // viewer has *:read
    expect(isAllowed("uncategorized", "create", "member", DEFAULT_ROLES)).toBe(false);
    expect(isAllowed("uncategorized", "create", "lead", DEFAULT_ROLES)).toBe(false);
    expect(isAllowed("uncategorized", "create", "admin", DEFAULT_ROLES)).toBe(true);
  });
});

describe("resolvePermissions", () => {
  it("returns permissions for a known role", () => {
    const perms = resolvePermissions("viewer", DEFAULT_ROLES);
    expect(perms).toHaveLength(1);
    expect(perms[0]).toEqual({ category: "*", verb: "read" });
  });

  it("returns empty for unknown role", () => {
    expect(resolvePermissions("ghost", DEFAULT_ROLES)).toHaveLength(0);
  });

  it("follows inheritance chain", () => {
    const roles: RoleMap = {
      base: { permissions: [{ category: "work", verb: "read" }] },
      child: {
        permissions: [{ category: "people", verb: "read" }],
        inherits: "base",
      },
    };
    const perms = resolvePermissions("child", roles);
    expect(perms).toHaveLength(2);
    expect(perms).toContainEqual({ category: "people", verb: "read" });
    expect(perms).toContainEqual({ category: "work", verb: "read" });
  });

  it("prevents circular inheritance", () => {
    const roles: RoleMap = {
      a: { permissions: [{ category: "work", verb: "read" }], inherits: "b" },
      b: { permissions: [{ category: "people", verb: "read" }], inherits: "a" },
    };
    // Should not infinite loop
    const perms = resolvePermissions("a", roles);
    expect(perms).toHaveLength(2);
  });
});

describe("methodToVerb", () => {
  it("maps HTTP methods to verbs", () => {
    expect(methodToVerb("GET")).toBe("read");
    expect(methodToVerb("get")).toBe("read");
    expect(methodToVerb("POST")).toBe("create");
    expect(methodToVerb("PUT")).toBe("update");
    expect(methodToVerb("PATCH")).toBe("update");
    expect(methodToVerb("DELETE")).toBe("delete");
    expect(methodToVerb("OPTIONS")).toBe("read"); // fallback
  });
});

describe("filterTools", () => {
  const tools: FilterableTool[] = [
    { name: "ticket-list", prefix: "ticket-", method: "get" },
    { name: "ticket-create", prefix: "ticket-", method: "post" },
    { name: "invoice-list", prefix: "invoice-", method: "get" },
    { name: "invoice-create", prefix: "invoice-", method: "post" },
    { name: "contact-list", prefix: "contact-", method: "get" },
    { name: "contact-update", prefix: "contact-", method: "put" },
    { name: "report-export", prefix: "report-", method: "get" },
    { name: "webhook-create", prefix: "webhook-", method: "post" },
  ];

  it("admin sees all tools", () => {
    const result = filterTools(tools, "admin", DEFAULT_ROLES);
    expect(result).toHaveLength(tools.length);
  });

  it("viewer sees only read operations", () => {
    const result = filterTools(tools, "viewer", DEFAULT_ROLES);
    const names = result.map((t) => t.name);
    expect(names).toContain("ticket-list");
    expect(names).toContain("invoice-list");
    expect(names).toContain("contact-list");
    expect(names).toContain("report-export");
    expect(names).not.toContain("ticket-create");
    expect(names).not.toContain("invoice-create");
    expect(names).not.toContain("contact-update");
    expect(names).not.toContain("webhook-create");
  });

  it("finance sees financial + read grants", () => {
    const result = filterTools(tools, "finance", DEFAULT_ROLES);
    const names = result.map((t) => t.name);
    expect(names).toContain("invoice-list");
    expect(names).toContain("invoice-create");
    expect(names).toContain("contact-list"); // people:read
    expect(names).toContain("report-export"); // reporting:read
    expect(names).not.toContain("ticket-list"); // no work access
    expect(names).not.toContain("webhook-create"); // no config access
    expect(names).not.toContain("contact-update"); // only people:read
  });

  it("member sees work + read grants for people/content", () => {
    const result = filterTools(tools, "member", DEFAULT_ROLES);
    const names = result.map((t) => t.name);
    expect(names).toContain("ticket-list");
    expect(names).toContain("ticket-create");
    expect(names).toContain("contact-list"); // people:read
    expect(names).not.toContain("contact-update"); // no people:write
    expect(names).not.toContain("invoice-list"); // no financial
    expect(names).not.toContain("webhook-create"); // no config
  });

  it("unknown role sees nothing", () => {
    const result = filterTools(tools, "ghost", DEFAULT_ROLES);
    expect(result).toHaveLength(0);
  });
});
