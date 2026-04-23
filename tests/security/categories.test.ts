import { describe, it, expect } from "vitest";
import { classifyPrefix } from "@/security/categories";

describe("classifyPrefix", () => {
  it("classifies ticket as work", () => {
    expect(classifyPrefix("ticket-")).toBe("work");
    expect(classifyPrefix("ticket")).toBe("work");
  });

  it("classifies invoice as financial", () => {
    expect(classifyPrefix("invoice-")).toBe("financial");
    expect(classifyPrefix("invoice")).toBe("financial");
  });

  it("classifies contact as people", () => {
    expect(classifyPrefix("contact-")).toBe("people");
    expect(classifyPrefix("contact")).toBe("people");
  });

  it("classifies webhook as config", () => {
    expect(classifyPrefix("webhook-")).toBe("config");
    expect(classifyPrefix("webhook")).toBe("config");
  });

  it("classifies report as reporting", () => {
    expect(classifyPrefix("report-")).toBe("reporting");
    expect(classifyPrefix("report")).toBe("reporting");
  });

  it("classifies campaign as content", () => {
    expect(classifyPrefix("campaign-")).toBe("content");
    expect(classifyPrefix("campaign")).toBe("content");
  });

  it("returns uncategorized for unknown prefixes", () => {
    expect(classifyPrefix("xyz-")).toBe("uncategorized");
    expect(classifyPrefix("foobar")).toBe("uncategorized");
  });

  // Real SaaS prefixes
  it("classifies HubSpot deal as work", () => {
    expect(classifyPrefix("deal")).toBe("work");
  });

  it("classifies GoHighLevel lead as people", () => {
    expect(classifyPrefix("lead")).toBe("people");
  });

  it("classifies Stripe subscription as financial", () => {
    expect(classifyPrefix("subscription")).toBe("financial");
  });

  it("classifies Asana task as work", () => {
    expect(classifyPrefix("task")).toBe("work");
  });

  it("strips trailing dash before matching", () => {
    expect(classifyPrefix("task-")).toBe("work");
    expect(classifyPrefix("invoice-")).toBe("financial");
  });

  it("is case-insensitive", () => {
    expect(classifyPrefix("TICKET-")).toBe("work");
    expect(classifyPrefix("Invoice")).toBe("financial");
  });
});
