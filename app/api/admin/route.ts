import { NextResponse } from "next/server";
import { loadConfig } from "@/config";
import { escapeHtml } from "@/http/html";
import {
  readAdminCookie,
  sessionCookieClearHeader,
  sessionCookieSetHeader,
  signSession,
  tokensEqual,
  verifySession,
} from "@/security/admin-session";
import {
  createStore,
  createUser,
  deleteUser,
  listUsers,
  resetMfa,
  type UserSummary,
} from "@/security/custom-users";

const VALID_PROFILES = ["admin", "lead", "member", "finance", "external", "viewer"];

function pageShell(inner: string): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>MCP Admin</title><style>
body{font-family:-apple-system,system-ui,sans-serif;margin:0;background:#0a0a0a;color:#e5e5e5;min-height:100vh;padding:32px 16px}
.wrap{max-width:860px;margin:0 auto}
h1{font-size:22px;margin:0 0 8px}
h2{font-size:15px;margin:28px 0 10px;color:#d4d4d4}
p{color:#a3a3a3;font-size:14px;margin:0 0 16px;line-height:1.5}
.card{background:#171717;border:1px solid #262626;border-radius:12px;padding:24px;margin-bottom:20px}
label{display:block;font-size:13px;color:#d4d4d4;margin-bottom:6px;margin-top:12px}
input,select{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #303030;background:#0a0a0a;color:#e5e5e5;font-size:14px;font-family:inherit}
input:focus,select:focus{outline:none;border-color:#525252}
.btn{display:inline-block;padding:9px 14px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;border:none;cursor:pointer;font-family:inherit}
.btn-primary{background:#fff;color:#1f1f1f}
.btn-danger{background:#3a1414;color:#fca5a5;border:1px solid #7f1d1d}
.btn-ghost{background:transparent;color:#a3a3a3;border:1px solid #303030}
.btn-primary:hover{background:#f1f1f1}
.btn-danger:hover{background:#4a1818}
.btn-ghost:hover{background:#1f1f1f}
.err{background:#3a1414;border:1px solid #7f1d1d;color:#fca5a5;padding:10px 12px;border-radius:8px;font-size:13px;margin:14px 0}
.ok{background:#142e1a;border:1px solid #14532d;color:#86efac;padding:10px 12px;border-radius:8px;font-size:13px;margin:14px 0}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:10px 12px;color:#a3a3a3;font-weight:600;border-bottom:1px solid #262626}
td{padding:12px;border-bottom:1px solid #1a1a1a;color:#d4d4d4}
td.actions{white-space:nowrap}
td.actions form{display:inline-block;margin:0 4px 0 0}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
.badge.yes{background:#142e1a;color:#86efac}
.badge.no{background:#2a1e14;color:#fdba74}
.row{display:flex;gap:12px;align-items:end;margin-top:12px;flex-wrap:wrap}
.row > *{flex:1;min-width:180px}
.row .btn-wrap{flex:0 0 auto}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.top h1{margin:0}
</style></head><body><div class="wrap">${inner}</div></body></html>`;
}

function renderLoginPage(error?: string): NextResponse {
  const inner = `<div class="card" style="max-width:380px;margin:80px auto">
<h1>MCP Admin</h1>
<p>Enter the admin token to manage users.</p>
${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
<form method="POST" action="/api/admin">
  <input type="hidden" name="action" value="login">
  <label for="token">Admin token</label>
  <input id="token" name="token" type="password" autocomplete="off" autofocus>
  <div style="margin-top:16px"><button type="submit" class="btn btn-primary">Sign in</button></div>
</form>
</div>`;
  return new NextResponse(pageShell(inner), { headers: { "Content-Type": "text/html" } });
}

function renderUsersPage(users: UserSummary[], notice?: string, error?: string): NextResponse {
  const rows = users
    .map((u) => {
      const enrolledBadge = u.mfaEnrolled
        ? `<span class="badge yes">Enrolled</span>`
        : `<span class="badge no">Not enrolled</span>`;
      const locked = u.lockedUntil && u.lockedUntil > new Date() ? ` · locked until ${u.lockedUntil.toISOString()}` : "";
      return `<tr>
<td class="mono">${escapeHtml(u.email)}</td>
<td>${escapeHtml(u.profile)}</td>
<td>${enrolledBadge}${locked}</td>
<td class="actions">
<form method="POST" action="/api/admin">
<input type="hidden" name="action" value="reset-mfa">
<input type="hidden" name="email" value="${escapeHtml(u.email)}">
<button type="submit" class="btn btn-ghost">Reset 2FA</button>
</form>
<form method="POST" action="/api/admin" onsubmit="return confirm('Delete ${escapeHtml(u.email)}? This cannot be undone.')">
<input type="hidden" name="action" value="delete">
<input type="hidden" name="email" value="${escapeHtml(u.email)}">
<button type="submit" class="btn btn-danger">Delete</button>
</form>
</td>
</tr>`;
    })
    .join("");

  const inner = `<div class="top"><h1>MCP Admin — Users</h1>
<form method="POST" action="/api/admin"><input type="hidden" name="action" value="logout"><button type="submit" class="btn btn-ghost">Sign out</button></form>
</div>
${notice ? `<div class="ok">${escapeHtml(notice)}</div>` : ""}
${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
<div class="card">
<h2>Add a user</h2>
<p>Share the temp password with the user out of band (1Password, Signal, etc.). On their first sign-in they'll be forced to set up 2FA.</p>
<form method="POST" action="/api/admin">
  <input type="hidden" name="action" value="create">
  <div class="row">
    <div><label for="email">Email</label><input id="email" name="email" type="email" required></div>
    <div><label for="tempPassword">Temp password</label><input id="tempPassword" name="tempPassword" type="text" required minlength="12"></div>
    <div><label for="profile">Profile</label><select id="profile" name="profile" required>${VALID_PROFILES.map((v) => `<option value="${v}">${v}</option>`).join("")}</select></div>
    <div class="btn-wrap"><button type="submit" class="btn btn-primary">Create user</button></div>
  </div>
</form>
</div>
<div class="card">
<h2>Existing users (${users.length})</h2>
${users.length === 0 ? `<p>No users yet. Add one above.</p>` : `<table><thead><tr><th>Email</th><th>Profile</th><th>2FA</th><th></th></tr></thead><tbody>${rows}</tbody></table>`}
</div>`;
  return new NextResponse(pageShell(inner), { headers: { "Content-Type": "text/html" } });
}

function requireAdmin(req: Request, secret: string): boolean {
  const cookieHeader = req.headers.get("cookie") || "";
  const raw = readAdminCookie(cookieHeader);
  if (!raw) return false;
  return verifySession(raw, secret) !== null;
}

export async function GET(req: Request) {
  const config = loadConfig();
  if (!config.custom) {
    return new NextResponse(pageShell(`<div class="card"><h1>Custom auth not configured</h1><p>Set CUSTOM_AUTH_ENCRYPTION_KEY, CUSTOM_AUTH_ADMIN_TOKEN, and DATABASE_URL to enable this page.</p></div>`), {
      status: 500,
      headers: { "Content-Type": "text/html" },
    });
  }
  if (!requireAdmin(req, config.oauthJwtSecret)) {
    return renderLoginPage();
  }
  const store = createStore(config.databaseUrl, config.custom.encryptionKey);
  const users = await listUsers(store);
  const url = new URL(req.url);
  return renderUsersPage(users, url.searchParams.get("notice") || undefined, url.searchParams.get("error") || undefined);
}

export async function POST(req: Request) {
  const config = loadConfig();
  if (!config.custom) return new NextResponse("Custom auth not configured", { status: 500 });

  const form = await req.formData();
  const action = ((form.get("action") as string) || "").trim();

  if (action === "login") {
    const submitted = ((form.get("token") as string) || "").trim();
    if (!submitted || !tokensEqual(submitted, config.custom.adminToken)) {
      return renderLoginPage("Invalid admin token.");
    }
    const session = signSession(config.oauthJwtSecret);
    const res = NextResponse.redirect(new URL("/api/admin", config.publicUrl || req.url).toString(), 302);
    res.headers.append("Set-Cookie", sessionCookieSetHeader(session));
    return res;
  }

  if (action === "logout") {
    const res = NextResponse.redirect(new URL("/api/admin", config.publicUrl || req.url).toString(), 302);
    res.headers.append("Set-Cookie", sessionCookieClearHeader());
    return res;
  }

  if (!requireAdmin(req, config.oauthJwtSecret)) {
    return renderLoginPage("Your session expired. Sign in again.");
  }

  const store = createStore(config.databaseUrl, config.custom.encryptionKey);
  const redirectBase = new URL("/api/admin", config.publicUrl || req.url);

  if (action === "create") {
    const email = ((form.get("email") as string) || "").trim().toLowerCase();
    const tempPassword = ((form.get("tempPassword") as string) || "");
    const profile = ((form.get("profile") as string) || "").trim();
    if (!email || !tempPassword || !profile) {
      redirectBase.searchParams.set("error", "Email, temp password, and profile are all required.");
      return NextResponse.redirect(redirectBase.toString(), 302);
    }
    if (tempPassword.length < 12) {
      redirectBase.searchParams.set("error", "Temp password must be at least 12 characters.");
      return NextResponse.redirect(redirectBase.toString(), 302);
    }
    if (!VALID_PROFILES.includes(profile)) {
      redirectBase.searchParams.set("error", `Profile must be one of: ${VALID_PROFILES.join(", ")}.`);
      return NextResponse.redirect(redirectBase.toString(), 302);
    }
    try {
      await createUser(store, { email, tempPassword, profile });
      redirectBase.searchParams.set("notice", `Created ${email}. Share the temp password securely.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("duplicate")) {
        redirectBase.searchParams.set("error", `User ${email} already exists.`);
      } else {
        redirectBase.searchParams.set("error", `Failed to create user: ${msg}`);
      }
    }
    return NextResponse.redirect(redirectBase.toString(), 302);
  }

  if (action === "delete") {
    const email = ((form.get("email") as string) || "").trim().toLowerCase();
    if (!email) {
      redirectBase.searchParams.set("error", "Email is required.");
      return NextResponse.redirect(redirectBase.toString(), 302);
    }
    const removed = await deleteUser(store, email);
    redirectBase.searchParams.set(removed ? "notice" : "error", removed ? `Deleted ${email}.` : `User ${email} not found.`);
    return NextResponse.redirect(redirectBase.toString(), 302);
  }

  if (action === "reset-mfa") {
    const email = ((form.get("email") as string) || "").trim().toLowerCase();
    if (!email) {
      redirectBase.searchParams.set("error", "Email is required.");
      return NextResponse.redirect(redirectBase.toString(), 302);
    }
    const ok = await resetMfa(store, email);
    redirectBase.searchParams.set(ok ? "notice" : "error", ok ? `Reset 2FA for ${email}. They'll re-enroll on next sign-in.` : `User ${email} not found.`);
    return NextResponse.redirect(redirectBase.toString(), 302);
  }

  redirectBase.searchParams.set("error", `Unknown action: ${action}`);
  return NextResponse.redirect(redirectBase.toString(), 302);
}

export const dynamic = "force-dynamic";
