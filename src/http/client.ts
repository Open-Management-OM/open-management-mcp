import type { NeonResponse } from "@/types";

const BASE_URL = "https://console.neon.tech/api/v2";
const MIN_INTERVAL_MS = 100;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;

let lastRequestTime = 0;

export function resetThrottle(): void {
  lastRequestTime = 0;
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

function validatePath(path: string): void {
  if (path.includes("..") || path.includes("//")) {
    throw new Error("Invalid path: path traversal or double slashes not allowed.");
  }
}

const ERROR_MAP: Record<number, string> = {
  401: "Access denied by Neon API. Check API key.",
  403: "Access denied by Neon API. Check API key.",
  404: "Resource not found.",
  429: "Neon rate limit exceeded. Try again shortly.",
};

interface ClientOptions {
  timeoutMs?: number;
}

export class NeonClient {
  private apiKey: string;
  private timeoutMs: number;

  constructor(apiKey: string, options?: ClientOptions) {
    this.apiKey = apiKey;
    this.timeoutMs = options?.timeoutMs ?? 30000;
  }

  async request(
    method: string,
    path: string,
    options?: { body?: unknown; query?: Record<string, string> }
  ): Promise<NeonResponse> {
    validatePath(path);
    await throttle();

    const url = new URL(`${BASE_URL}${path}`);
    if (options?.query) {
      for (const [k, v] of Object.entries(options.query)) {
        url.searchParams.set(k, v);
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(url.toString(), {
          method: method.toUpperCase(),
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: options?.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => (headers[k] = v));

        if (!res.ok) {
          const status = res.status;

          // Don't retry 4xx (except 429)
          if (status >= 400 && status < 500 && status !== 429) {
            return {
              status,
              data: { error: ERROR_MAP[status] || "Neon API client error." },
              headers,
            };
          }

          // Retry on 429 and 5xx
          if (attempt < MAX_RETRIES - 1 && (status === 429 || status >= 500)) {
            const jitter = Math.random() * 1000;
            await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt) + jitter));
            continue;
          }

          return {
            status,
            data: { error: ERROR_MAP[status] || "Neon API server error." },
            headers,
          };
        }

        const data = await res.json();
        return { status: res.status, data, headers };
      } catch (err) {
        clearTimeout(timeout);
        lastError = err as Error;

        if (attempt < MAX_RETRIES - 1) {
          const jitter = Math.random() * 1000;
          await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt) + jitter));
          continue;
        }
      }
    }

    throw lastError || new Error("Request failed after retries");
  }
}
