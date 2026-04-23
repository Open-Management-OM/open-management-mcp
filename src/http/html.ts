import { NextResponse } from "next/server";

/**
 * Escape HTML special characters to prevent XSS in rendered pages.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render a styled HTML error page for OAuth/sign-in flows.
 */
export function renderError(message: string, status = 400) {
  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign-in error</title><style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5}.card{background:#171717;border:1px solid #262626;border-radius:12px;padding:32px;max-width:420px}h1{font-size:18px;margin:0 0 8px}p{color:#a3a3a3;font-size:14px;margin:0}</style></head><body><div class="card"><h1>Sign-in error</h1><p>${escapeHtml(message)}</p></div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html" } });
}
