# Cloudflare Reverse Proxy Setup

Put your MCP behind a Cloudflare-managed hostname (e.g. `mcp.yourco.com`) with orange-cloud proxying on. You get edge DDoS protection, geo / bot filtering, and you can later layer more (WAF rules, rate limiting, CF Access) if your team grows into it.

**Audience:** someone deploying this MCP to Vercel who wants to front it with Cloudflare. The instructions are written so an AI assistant can read them and walk you through the setup, or so you can follow them yourself.

**Scope of this doc:** plain orange-cloud proxy only. No CF Access, no Managed OAuth, no Worker in front. If you want those later, see the "When to add more" section at the bottom.

---

## What you'll have when this is done

- Your MCP is reachable at `https://mcp.yourco.com/api/mcp` (swap in your domain)
- All traffic hits Cloudflare's edge first, then CF forwards to your Vercel origin
- Vercel's `*.vercel.app` preview URLs still exist, but you'll stop sharing them with students and / or lock them down later
- OAuth callbacks (Google, Microsoft, Custom Auth) all use the new hostname

---

## Prerequisites

1. **Your domain is on Cloudflare.** Nameservers are pointed at Cloudflare's (`xxx.ns.cloudflare.com`). If you're not there yet, add the site to Cloudflare first and let DNS propagate.
2. **The MCP is deployed on Vercel** and working on the random `your-project.vercel.app` URL. Before touching Cloudflare, verify the raw Vercel URL serves `/api/mcp` (bearer token required, so expect a 401, not a 500).
3. **You have admin on the Cloudflare zone** and the Vercel project.

---

## The six steps (in this exact order)

If you do these out of order you get infinite redirect loops or silent OAuth failures. Order matters.

### 1. Add the hostname to the Vercel project

- Vercel dashboard >> your project >> Settings >> Domains >> Add
- Enter `mcp.yourco.com`
- Vercel will show one or more records to add. Typically:
  - A CNAME record: `mcp` >> `cname.vercel-dns.com` (or similar)
  - Sometimes a TXT record for verification: `_vercel` with a random value
- **Do not add these on the Cloudflare side yet-- read step 2 first.** Vercel will show "Invalid Configuration" until DNS lands; that's expected.

### 2. Add the DNS records in Cloudflare-- grey cloud initially

- Cloudflare dashboard >> your domain >> DNS >> Records >> Add record
- Copy whatever Vercel told you to add in step 1. For each record:
  - **CNAME (traffic):** set **Proxy status = DNS only (grey cloud)** for now
  - **TXT (verification):** must always stay **DNS only (grey cloud)**-- proxying a TXT record breaks verification
- Wait a minute for DNS to propagate, then confirm Vercel's domain page flips to "Valid Configuration" with a green check.

### 3. Set the SSL/TLS mode to Full (Strict)

**This is the single most-likely-to-break setting in the entire flow.**

- Cloudflare dashboard >> your domain >> SSL/TLS >> Overview
- Find "SSL/TLS encryption" >> select **Full (strict)**

Why this matters:

| Mode | CF <-> origin | What happens with Vercel |
|------|---------------|--------------------------|
| Off | Plain HTTP | Vercel 308 redirects to HTTPS >> loop |
| Flexible | Plain HTTP | Vercel 308 redirects to HTTPS >> infinite loop, MCP unreachable |
| Full | HTTPS (any cert) | Works, but skips cert validation |
| Full (Strict) | HTTPS (valid cert) | Works and Vercel's cert is valid |

Vercel issues valid Let's Encrypt certs for every custom domain, so Full (Strict) is the right setting.

### 4. Verify the grey-cloud version works

Before you flip the orange cloud, make sure the raw Vercel path works via the custom domain:

```bash
curl -i https://mcp.yourco.com/api/mcp
```

Expect a 401 (bearer token required) or 405 (wrong method), both of which mean "request reached the MCP server." If you see a 5xx, the origin is unreachable-- don't flip the orange cloud yet, fix the origin first.

### 5. Flip the orange cloud on the traffic CNAME

- Cloudflare dashboard >> DNS >> Records
- Click the grey cloud next to your `mcp` CNAME >> it turns orange
- Leave TXT records grey
- Wait 30 seconds

Re-run the curl from step 4. You should still get 401 / 405. If you now get a redirect loop, go back to step 3 and verify SSL mode is Full (Strict).

### 6. Update env vars + OAuth client registrations

Now that the hostname is live, every place that embeds the URL needs updating:

**In Vercel >> Settings >> Environment Variables:**
- Set `PUBLIC_URL=https://mcp.yourco.com` (no trailing slash)
- Redeploy the project (Deployments >> latest >> ... >> Redeploy)

**If you configured Google SSO** (see [google-sso-setup.md](google-sso-setup.md)):
- Google Cloud Console >> Google Auth Platform >> Clients >> your client
- Update Authorized redirect URI to `https://mcp.yourco.com/api/oauth/callback/google`
- Save

**If you configured Microsoft SSO** (see [microsoft-sso-setup.md](microsoft-sso-setup.md)):
- Entra admin center >> App registrations >> your app >> Authentication
- Update the redirect URI to `https://mcp.yourco.com/api/oauth/callback/microsoft`
- Save

**For any Claude.ai users:** they need to remove the old connector entry and add a new one pointing at `https://mcp.yourco.com/api/mcp`. The paste-in Advanced Settings OAuth Client ID / Secret values stay the same.

Do a full auth flow end-to-end in Claude.ai to confirm nothing is stale.

---

## Cloudflare defaults that can silently break MCP

Most CF zones ship with security features on. Some of them challenge MCP traffic and need to be disabled or scoped so only real users get challenges.

### Bot Fight Mode (often ON by default)

- Security >> Bots >> Bot Fight Mode
- **Turn OFF** for the MCP hostname, or add a WAF skip rule that whitelists `/api/mcp*` and `/api/oauth/*`
- Why: Bot Fight Mode challenges traffic that "looks automated." Claude.ai's backend infrastructure can trip this heuristic. A challenged MCP client can't render the challenge page-- it just fails silently.

### Managed Challenge / Under Attack Mode

- Security >> Settings
- **Leave off.** Both feature interstitial CAPTCHA pages that MCP clients cannot complete.
- If you ever hit an active attack, scope the challenge to non-MCP paths only via a WAF rule.

### Browser Integrity Check

- Security >> Settings >> Browser Integrity Check
- Fine to leave on in most cases. If you see unexplained 403s from Claude.ai, disable it for the MCP hostname as the first debug step.

### Minimum TLS Version

- SSL/TLS >> Edge Certificates >> Minimum TLS Version
- Leave at 1.2. Don't bump to 1.3 yet-- some older MCP clients (desktop bridges, CLI tools) still ship with TLS 1.2 only.

### Always Use HTTPS

- SSL/TLS >> Edge Certificates >> Always Use HTTPS
- **Leave ON.** This is safe with Vercel because SSL mode is Full (Strict); CF will upgrade HTTP to HTTPS at the edge and forward over HTTPS.

### Cache Rules

- No changes needed. Vercel sends `cache-control: no-store` on `/api/*` responses by default, and CF respects that.

---

## Vercel-side hardening (optional but recommended)

Cloudflare proxies the custom domain, but `your-project.vercel.app` is still a public URL pointing at the same code. If a student shares the vercel.app URL by accident, you lose the edge protections.

Two ways to close that:

1. **Vercel Dashboard >> Settings >> Deployment Protection >> Protection Bypass**-- enable Vercel Authentication for all non-production deployments. Students can still deploy previews, but only authenticated team members can hit them.

2. **Reject the Vercel host in Next.js middleware.** Add a middleware that 404s any request whose `Host` header doesn't match your custom domain. This belongs in `middleware.ts` at the repo root:

```ts
// middleware.ts (example -- not shipped in this repo)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  if (host.endsWith(".vercel.app") && process.env.BLOCK_VERCEL_HOST === "1") {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.next();
}
```

Set `BLOCK_VERCEL_HOST=1` in production env vars. Previews stay reachable for debugging. Not default-on because some setups genuinely use the vercel.app URL (local dev, CI smoke tests, etc.).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `curl` shows infinite redirects (`too many redirects`) | SSL mode is Flexible or Off | SSL/TLS >> set to Full (Strict) |
| `521 Web server is down` | Origin unreachable from CF | Check Vercel deploy is live, domain is "Valid Configuration" in Vercel |
| `522 Connection timed out` | Origin too slow or rate-limiting CF | Usually a cold Vercel function-- retry; if persistent, check Vercel logs |
| `525 SSL handshake failed` | Vercel cert not ready yet | Wait 5-10 min after adding domain, then retry. Temporarily downgrade to Full (non-Strict) as a test. |
| OAuth callbacks 404 or "invalid redirect" | `PUBLIC_URL` stale | Set `PUBLIC_URL=https://mcp.yourco.com` in Vercel, redeploy. Also update Google / Microsoft client redirect URIs. |
| Claude.ai "couldn't connect to server" | Old connector still pointing at vercel.app | Remove + re-add the connector with the new URL |
| Students see a CF challenge page instead of the MCP | Bot Fight Mode or Managed Challenge enabled | Security >> Bots >> turn OFF for this hostname, or add WAF skip rule |
| Custom domain shows "Invalid Configuration" in Vercel | TXT record proxied by CF, or CNAME value wrong | TXT records must always be grey cloud (DNS only). Re-check Vercel's instructions. |
| Works from your browser, fails from some clients | Minimum TLS set to 1.3 | Drop minimum back to 1.2 |
| Custom domain works, but specific paths still 404 | You forgot to redeploy Vercel after changing `PUBLIC_URL` | Trigger a redeploy |

---

## When to add more (out of scope for this doc)

Pure orange-cloud is sufficient for most teams. You'd add more CF features if:

- **Your team is enterprise / regulated.** Add CF Access in front of `/api/admin` so only named users can hit the user-management UI. Leave `/api/mcp` public (CF Access can't easily sit in front of OAuth discovery endpoints without a dedicated hostname-- see Steward's setup at `mcp.fulcruminsights.io` for the pattern if you go that route).
- **You're seeing abuse.** Add CF rate limiting rules on `/api/oauth/authorize` (to slow credential stuffing) and `/api/oauth/token` (to slow token replay attempts).
- **You want to hide the Vercel origin entirely.** Use CF's Authenticated Origin Pulls so Vercel only accepts requests that came through CF. Extra operational complexity; usually overkill.
- **You want edge compute in front.** Put a CF Worker in front of the Vercel origin to rewrite headers, aggregate logs, or transform responses. Not needed for MCP out of the box.

If / when you need any of these, the starting point is the Steward reference architecture (two-factor identity at the edge, service tokens for non-interactive clients, path-scoped Access apps).
