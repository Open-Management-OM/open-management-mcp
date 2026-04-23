import { describe, it, expect } from "vitest";
import { truncateResponse } from "@/http/truncate";

describe("truncateResponse", () => {
  it("returns short strings unchanged", () => {
    const text = "Hello, world!";
    expect(truncateResponse(text, 1000)).toBe(text);
  });

  it("truncates at byte limit with marker", () => {
    const text = "a".repeat(200);
    const result = truncateResponse(text, 100);
    // The truncated content should start with the first 100 bytes
    expect(result).toContain("a".repeat(100));
    // Should include a truncation marker
    expect(result).toContain("[Response truncated");
    // Full text should not be present
    expect(result.length).toBeLessThan(text.length + 100);
  });

  it("uses default limit when none specified", () => {
    // Default is 50000 bytes -- a short string should pass through
    const short = "short string";
    expect(truncateResponse(short)).toBe(short);

    // A string over 50KB should be truncated
    const big = "x".repeat(60000);
    const result = truncateResponse(big);
    expect(result).toContain("[Response truncated");
    expect(result.length).toBeLessThan(big.length);
  });
});
