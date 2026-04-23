import { describe, it, expect, vi, afterEach } from "vitest";

describe("NeonClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.useRealTimers();
  });

  async function getClient(apiKey = "test-api-key", options?: { timeoutMs?: number }) {
    const { NeonClient } = await import("@/http/client");
    return new NeonClient(apiKey, options);
  }

  it("constructs successfully", async () => {
    const client = await getClient("my-key");
    expect(client).toBeDefined();
  });

  it("enforces minimum interval between requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { forEach: vi.fn() },
      json: async () => ({ data: "ok" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = await getClient();
    const t0 = Date.now();
    await client.request("GET", "/projects");
    await client.request("GET", "/projects");
    const elapsed = Date.now() - t0;

    expect(elapsed).toBeGreaterThanOrEqual(80);
  });

  it("maps 401 to safe error message", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: { forEach: vi.fn() },
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = await getClient();
    const result = await client.request("GET", "/projects");
    expect(result.status).toBe(401);
    expect((result.data as any).error).toBe("Access denied by Neon API. Check API key.");
  });

  it("maps 404 to safe error message", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { forEach: vi.fn() },
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = await getClient();
    const result = await client.request("GET", "/projects/nonexistent");
    expect(result.status).toBe(404);
    expect((result.data as any).error).toBe("Resource not found.");
  });

  it("maps 429 to safe error message after retries", async () => {
    vi.useFakeTimers();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { forEach: vi.fn() },
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = await getClient();
    const requestPromise = client.request("GET", "/projects");

    // Advance timers past all retry delays (3 attempts, exponential backoff ~2s, ~4s + jitter)
    await vi.runAllTimersAsync();

    const result = await requestPromise;
    expect(result.status).toBe(429);
    expect((result.data as any).error).toBe("Neon rate limit exceeded. Try again shortly.");
  });

  it("rejects path traversal attempt /../etc/passwd", async () => {
    const client = await getClient();
    await expect(client.request("GET", "/../etc/passwd")).rejects.toThrow(
      "Invalid path"
    );
  });

  it("rejects path with double slashes /projects//test", async () => {
    const client = await getClient();
    await expect(client.request("GET", "/projects//test")).rejects.toThrow(
      "Invalid path"
    );
  });
});
