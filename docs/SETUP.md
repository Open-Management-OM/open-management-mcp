# Deployment Guide

## Prerequisites

- [Vercel](https://vercel.com) account
- API key for your target service (Neon by default)
- Node.js 18+ (for local development)

## Deploy to Vercel

1. Fork or clone the repo
2. Import into Vercel -- the Next.js framework preset is auto-detected
3. Set environment variables (see below)
4. Deploy

## Required Environment Variables

Set these in Vercel >> Project Settings >> Environment Variables:

| Variable | Description |
|----------|-------------|
| `NEON_API_KEY` | Your API key (Neon Console >> Account >> API Keys) |
| `MCP_AUTH_TOKENS` | JSON object with token, role, and label (used by Claude Code + break-glass admin) |

### MCP_AUTH_TOKENS Format

```json
{
  "tokens": [
    {
      "token": "your-secure-token-here",
      "profile": "admin",
      "label": "Your Name"
    }
  ]
}
```

Generate a secure token:

```bash
openssl rand -base64 32
```

You can define multiple tokens with different roles for different users. Available roles: `admin`, `lead`, `member`, `finance`, `external`, `viewer`.

## Required for Claude.ai: OAuth

This is how your team connects the MCP from Claude.ai desktop, web, and mobile. Set all of these unless the only consumer is a local Claude Code install.

| Variable | Description |
|----------|-------------|
| `OAUTH_CLIENT_ID` | Self-chosen identifier |
| `OAUTH_CLIENT_SECRET` | Self-generated secret |
| `OAUTH_JWT_SECRET` | JWT signing key (defaults to `NEON_API_KEY` if omitted) |
| `PUBLIC_URL` | Your deployed URL, no trailing slash |
| `DATABASE_URL` | Neon connection string for OAuth session storage |

## Required for Claude.ai: SSO (Google, Microsoft, or both)

Once OAuth is on, users need an identity provider to sign in with. Pick one or both:

- **[Microsoft SSO](microsoft-sso-setup.md)** -- Entra (Azure AD) single-tenant, role by security group
- **[Google SSO](google-sso-setup.md)** -- Google Workspace or personal accounts, role by email allowlist

If both are configured, users see a provider picker at sign-in. If only one is configured, they're sent straight to it. If neither is configured, the OAuth flow falls back to the bearer-token passphrase screen, which is fine for local Claude Code dev but not the experience you want for a team.

### Microsoft SSO Variables

| Variable | Description |
|----------|-------------|
| `MICROSOFT_TENANT_ID` | Azure AD tenant ID |
| `MICROSOFT_CLIENT_ID` | Entra app registration client ID |
| `MICROSOFT_CLIENT_SECRET` | Entra app client secret |
| `MICROSOFT_GROUP_PROFILES` | JSON mapping security group GUIDs to roles |

### Google SSO Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_EMAIL_PROFILES` | JSON mapping email addresses to roles |

## Verify the Deployment

After deploying, verify it works:

1. **Check the health endpoint:**
   ```
   curl https://your-app.vercel.app/api/mcp
   ```

2. **Connect your AI client** to `https://your-app.vercel.app/api/mcp` with your bearer token

3. **Test a tool call** -- ask your AI assistant to list projects (or whatever your API's first read endpoint is)

## Putting Cloudflare in Front

Optional but recommended for production. [cloudflare-proxy-setup.md](cloudflare-proxy-setup.md) walks through pointing a custom domain (e.g. `mcp.yourco.com`) through Cloudflare's orange-cloud proxy at your Vercel origin-- six ordered steps, SSL-mode gotchas, and Cloudflare defaults (Bot Fight Mode, Managed Challenges) that silently break MCP traffic if left enabled.

## Good to Know

- **Defaults are read-only safe.** The default allowed operations only include GET endpoints. Write operations require explicit allowlisting.
- **Tokens are hashed.** Auth tokens are compared using SHA-256 with timing-safe equality-- never stored or logged in plain text.
- **Sensitive fields are redacted.** Authorization headers, tokens, secrets, and passwords are automatically stripped from audit logs.
- **Tool count limit.** MCP caps at 128 tools. The server warns at 80+ and errors at 128+. If your API is large, narrow `ALLOWED_OPERATIONS` to what you actually need.
