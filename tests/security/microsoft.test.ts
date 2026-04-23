import { describe, it, expect } from "vitest";
import { pickProfile } from "@/security/providers/microsoft";

describe("pickProfile", () => {
  const mapping = {
    "group-admin": "admin",
    "group-lead": "lead",
    "group-finance": "finance",
    "group-member": "member",
    "group-external": "external",
    "group-viewer": "viewer",
  };

  it("returns null when the user is in no mapped group", () => {
    expect(pickProfile(["unknown-group"], mapping)).toBeNull();
    expect(pickProfile([], mapping)).toBeNull();
  });

  it("resolves each real RBAC role when the group matches directly", () => {
    expect(pickProfile(["group-admin"], mapping)).toBe("admin");
    expect(pickProfile(["group-lead"], mapping)).toBe("lead");
    expect(pickProfile(["group-finance"], mapping)).toBe("finance");
    expect(pickProfile(["group-member"], mapping)).toBe("member");
    expect(pickProfile(["group-external"], mapping)).toBe("external");
    expect(pickProfile(["group-viewer"], mapping)).toBe("viewer");
  });

  it("prefers admin when the user is in multiple mapped groups", () => {
    expect(pickProfile(["group-viewer", "group-admin"], mapping)).toBe("admin");
    expect(pickProfile(["group-external", "group-admin", "group-member"], mapping)).toBe("admin");
  });

  it("follows the priority order admin > lead > finance > member > external > viewer", () => {
    expect(pickProfile(["group-lead", "group-member"], mapping)).toBe("lead");
    expect(pickProfile(["group-finance", "group-member"], mapping)).toBe("finance");
    expect(pickProfile(["group-member", "group-external"], mapping)).toBe("member");
    expect(pickProfile(["group-external", "group-viewer"], mapping)).toBe("external");
  });

  it("still returns a profile for custom role names not in the priority list", () => {
    const customMapping = { "group-support": "support", "group-auditor": "auditor" };
    const result = pickProfile(["group-support", "group-auditor"], customMapping);
    expect(["support", "auditor"]).toContain(result);
  });

  it("ignores groups not present in the mapping", () => {
    expect(pickProfile(["unknown-1", "group-viewer", "unknown-2"], mapping)).toBe("viewer");
  });
});
