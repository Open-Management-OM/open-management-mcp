import { escapeHtml } from "@/http/html";

interface LayoutOpts {
  title: string;
  body: string;
  note?: string;
}

function page({ title, body, note }: LayoutOpts): string {
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>
body{font-family:-apple-system,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5}
.card{background:#171717;border:1px solid #262626;border-radius:12px;padding:32px;max-width:420px;width:calc(100% - 32px);box-sizing:border-box}
h1{font-size:20px;margin:0 0 8px}
h2{font-size:15px;margin:24px 0 8px;color:#d4d4d4}
p{color:#a3a3a3;font-size:14px;margin:0 0 20px;line-height:1.5}
label{display:block;font-size:13px;color:#d4d4d4;margin-bottom:6px;margin-top:14px}
input[type=email],input[type=password],input[type=text]{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #303030;background:#0a0a0a;color:#e5e5e5;font-size:15px;font-family:inherit}
input:focus{outline:none;border-color:#525252}
.btn{display:block;width:100%;box-sizing:border-box;padding:12px;border-radius:8px;text-align:center;text-decoration:none;font-size:15px;font-weight:600;margin-top:16px;border:none;cursor:pointer;font-family:inherit}
.btn-primary{background:#fff;color:#1f1f1f}
.btn-primary:hover{background:#f1f1f1}
.btn-ghost{background:transparent;color:#a3a3a3;border:1px solid #303030;margin-top:10px}
.btn-ghost:hover{background:#1f1f1f}
.err{background:#3a1414;border:1px solid #7f1d1d;color:#fca5a5;padding:10px 12px;border-radius:8px;font-size:13px;margin:14px 0}
.ok{background:#142e1a;border:1px solid #14532d;color:#86efac;padding:10px 12px;border-radius:8px;font-size:13px;margin:14px 0}
.codes{background:#0a0a0a;border:1px solid #262626;border-radius:8px;padding:14px;margin:14px 0;font-family:ui-monospace,Menlo,monospace;font-size:14px;line-height:1.9;letter-spacing:0.04em;color:#e5e5e5;user-select:all}
.qr{display:flex;justify-content:center;margin:16px 0;background:#fff;padding:16px;border-radius:8px}
.qr svg{width:220px;height:220px}
.secret{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#a3a3a3;background:#0a0a0a;padding:8px 10px;border-radius:6px;border:1px solid #262626;word-break:break-all;user-select:all}
a.link{color:#a3a3a3;font-size:13px;text-decoration:underline}
a.link:hover{color:#d4d4d4}
</style></head><body><div class="card">${body}${note ? `<p style="margin-top:20px;font-size:12px">${note}</p>` : ""}</div></body></html>`;
}

export interface ClaudeParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

function hiddenClaudeInputs(p: ClaudeParams): string {
  return `<input type="hidden" name="client_id" value="${escapeHtml(p.clientId)}">
<input type="hidden" name="redirect_uri" value="${escapeHtml(p.redirectUri)}">
<input type="hidden" name="state" value="${escapeHtml(p.state)}">
<input type="hidden" name="code_challenge" value="${escapeHtml(p.codeChallenge)}">
<input type="hidden" name="code_challenge_method" value="${escapeHtml(p.codeChallengeMethod)}">`;
}

export function renderLogin(p: ClaudeParams, error?: string, prefillEmail?: string): Response {
  const body = `<h1>Sign in</h1>
<p>Enter your team account credentials to continue.</p>
${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
<form method="POST" action="/api/oauth/authorize">
  <input type="hidden" name="provider" value="custom">
  ${hiddenClaudeInputs(p)}
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required autocomplete="email" value="${escapeHtml(prefillEmail || "")}">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" required autocomplete="current-password">
  <button type="submit" class="btn btn-primary">Continue</button>
</form>`;
  return new Response(page({ title: "Sign in", body }), { headers: { "Content-Type": "text/html" } });
}

export function renderMfaChallenge(p: ClaudeParams, error?: string): Response {
  const body = `<h1>Enter your 6-digit code</h1>
<p>Open your authenticator app and enter the code for this account.</p>
${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
<form method="POST" action="/api/oauth/mfa">
  ${hiddenClaudeInputs(p)}
  <label for="code">6-digit code</label>
  <input id="code" name="code" type="text" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,8}" autofocus>
  <button type="submit" class="btn btn-primary">Verify</button>
</form>
<form method="POST" action="/api/oauth/mfa" style="margin-top:20px">
  <input type="hidden" name="mode" value="backup">
  ${hiddenClaudeInputs(p)}
  <h2>Lost your device?</h2>
  <label for="backup">Backup code</label>
  <input id="backup" name="code" type="text" autocomplete="off" pattern="[a-f0-9]{8}" placeholder="8-character code">
  <button type="submit" class="btn btn-ghost">Use backup code</button>
</form>`;
  return new Response(page({ title: "Verify", body }), { headers: { "Content-Type": "text/html" } });
}

export function renderEnrollQr(p: ClaudeParams, secret: string, qrSvg: string, error?: string): Response {
  const body = `<h1>Set up two-factor authentication</h1>
<p>This is your first sign-in. Scan the QR code with an authenticator app (1Password, Authy, Google Authenticator, etc.) and enter the 6-digit code to confirm.</p>
${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
<div class="qr">${qrSvg}</div>
<h2>Can't scan? Enter this secret manually</h2>
<div class="secret">${escapeHtml(secret)}</div>
<form method="POST" action="/api/oauth/enroll">
  ${hiddenClaudeInputs(p)}
  <label for="code">6-digit code from your app</label>
  <input id="code" name="code" type="text" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,8}" autofocus>
  <button type="submit" class="btn btn-primary">Confirm and continue</button>
</form>`;
  return new Response(page({ title: "Set up 2FA", body }), { headers: { "Content-Type": "text/html" } });
}

export function renderBackupCodes(p: ClaudeParams, codes: string[]): Response {
  const body = `<h1>Save your backup codes</h1>
<p>If you lose access to your authenticator, you can sign in once per code below. Each code works only one time. Save them somewhere safe before continuing.</p>
<div class="codes">${codes.map(escapeHtml).join("<br>")}</div>
<form method="POST" action="/api/oauth/enroll">
  <input type="hidden" name="mode" value="finalize">
  ${hiddenClaudeInputs(p)}
  <button type="submit" class="btn btn-primary">I've saved them, continue</button>
</form>`;
  return new Response(page({ title: "Backup codes", body }), { headers: { "Content-Type": "text/html" } });
}

export function renderLocked(p: ClaudeParams): Response {
  const body = `<h1>Account temporarily locked</h1>
<p>Too many failed sign-in attempts. Try again in 15 minutes, or contact your MCP administrator.</p>
<a class="link" href="/api/oauth/authorize?client_id=${encodeURIComponent(p.clientId)}&redirect_uri=${encodeURIComponent(p.redirectUri)}&state=${encodeURIComponent(p.state)}&code_challenge=${encodeURIComponent(p.codeChallenge)}&code_challenge_method=${encodeURIComponent(p.codeChallengeMethod)}">Back to sign in</a>`;
  return new Response(page({ title: "Locked", body }), { headers: { "Content-Type": "text/html" } });
}
