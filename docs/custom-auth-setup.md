# Custom Auth Setup

For teams that don't want to set up Google or Microsoft SSO. Users live in a Neon table, sign in with email + password, and are required to enroll TOTP 2FA on their first sign-in. Admin manages users from a web page at `/api/admin`.

Use this path when:
- You don't have Google Workspace or Microsoft 365
- You have them but don't want to involve IT for an app registration
- You want team members outside your org (contractors, partners) to access the MCP without being in your IdP

## What you get

- Password-based login (bcrypt hashes, 5-failure account lockout for 15 minutes)
- TOTP 2FA enrolled on first sign-in (SHA1 / 6 digits / 30s period, compatible with any TOTP-based authenticator app)
- 10 single-use backup codes per user, stored as SHA-256 hashes
- TOTP secrets encrypted at rest with AES-256-GCM
- Same OAuth flow as Google/MS SSO-- drops into Claude.ai with zero client-side differences
- Admin web UI at `/api/admin` to create/delete users and reset 2FA

## Prerequisites

- You already deployed this MCP to Vercel (see [SETUP.md](SETUP.md))
- `DATABASE_URL`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_JWT_SECRET`, and `PUBLIC_URL` are already set for the OAuth flow
- Your Neon database has the `pgcrypto` extension available (`gen_random_uuid()`)-- this is enabled by default on Neon projects

## 1. Generate the encryption key

The MCP encrypts each user's TOTP secret with AES-256-GCM before writing to the database. You need a 64-character hex key (32 bytes):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output. Store it somewhere safe (a password manager or your secrets vault)-- if you lose it, every user's 2FA is invalidated and they have to re-enroll.

## 2. Generate the admin token

The admin UI at `/api/admin` is gated by a bearer-style shared secret. Generate a strong one:

```bash
openssl rand -base64 32
```

Anyone with this token can create/delete users and reset 2FA for any account. Treat it like a root password. Store it in a password manager.

## 3. Add env vars to Vercel

Vercel >> your project >> **Settings >> Environment Variables**. Add:

| Variable | Value |
|----------|-------|
| `CUSTOM_AUTH_ENCRYPTION_KEY` | From step 1 (64 hex chars) |
| `CUSTOM_AUTH_ADMIN_TOKEN` | From step 2 |
| `CUSTOM_AUTH_ISSUER` | Optional-- what authenticator apps show (default: "Claude MCP") |

Also confirm `DATABASE_URL` and `PUBLIC_URL` are set (these are used by the OAuth + admin flow).

Redeploy (Deployments >> latest >> ... >> Redeploy) so the new values take effect.

## 4. First visit to /api/admin

Visit `https://<your-mcp-domain>/api/admin` in your browser. You'll see an admin sign-in card.

Paste the `CUSTOM_AUTH_ADMIN_TOKEN` from step 2. Your session lasts 1 hour and is cookie-scoped to `/api/admin` only-- it does NOT grant access to MCP tools.

On first load the `custom_users` table is created automatically. No migrations to run manually.

## 5. Add your first user

In the "Add a user" form:
- **Email**: the user's real email (case-insensitive)
- **Temp password**: any string, minimum 12 characters. You'll share this with the user through a secure channel (a shared password-manager item, encrypted messenger, or whatever your team uses for sensitive handoffs). They keep using this password-- there's no forced password change on first sign-in, so pick something you'd be comfortable with them keeping.
- **Profile**: one of `admin`, `lead`, `member`, `finance`, `external`, `viewer`. See the [main README](../README.md#rbac-system) for what each profile can do.

Click **Create user**. They'll appear in the table below with "2FA: Not enrolled".

## 6. The user signs in

Send the user the MCP URL + their email + their temp password.

1. They open Claude.ai >> Settings >> Connectors >> Add custom connector >> paste `https://<your-mcp-domain>/api/mcp`
2. Claude.ai prompts them for the OAuth client_id and secret in **Advanced settings**-- tell them to use the values you set for `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` in Vercel. (These are the MCP's own OAuth client credentials, not anything Google or Microsoft-- this server does not implement dynamic client registration.)
3. Claude.ai opens the MCP's sign-in page. If Custom Auth is the only provider configured, they see the email+password form directly. If Google/MS are also configured, they see a picker and click "Sign in with your team account".
4. They enter email + temp password and click Continue.
5. Because it's their first sign-in, they're routed to the 2FA enrollment screen:
   - A QR code is rendered in the browser
   - They scan it with their authenticator app (any TOTP-based one works).
   - They enter the 6-digit code the app shows to confirm the secret is correctly copied
6. On success, 10 backup codes are shown **once**. The user should save these somewhere safe (password manager). Each code works only one time. If they lose their device, these codes are the recovery path.
7. They click "I've saved them, continue" and are bounced back to Claude.ai. The MCP is now wired up.

On every subsequent sign-in: email + password >> 6-digit TOTP code. No enrollment prompt.

## 7. Managing users over time

Back at `/api/admin` >> Users:

- **Reset 2FA**: wipes the user's TOTP secret and marks them "not enrolled". Next sign-in they'll be forced through enrollment again. Use this when someone loses their phone or you want to rotate their authenticator.
- **Delete**: hard-removes the user record. They can't sign in until recreated. There's a confirm dialog to avoid misclicks.

There's no password reset flow for week 1. If someone forgets their password, delete and recreate them with a new temp password.

## Security notes

- Passwords are bcrypt-hashed (cost factor 10) before storage
- TOTP secrets are AES-256-GCM encrypted with your `CUSTOM_AUTH_ENCRYPTION_KEY` + a random 12-byte nonce per user
- Backup codes are SHA-256 hashed (one-way)-- consumed codes are removed from the stored list, not marked used
- Account lockout: 5 failed password attempts >> 15-minute lock. No email notification; the user sees a "locked" page
- The admin session cookie (`mcp_admin_session`) is HttpOnly, Secure, SameSite=Lax, scoped to `/api/admin`
- The sign-in step cookie (`mcp_custom_step`) is HttpOnly, Secure, SameSite=Lax, scoped to `/api/oauth`, 10-minute TTL
- The admin UI is NOT rate-limited at the MCP layer. Put it behind Vercel's built-in protections if you're worried about brute force on the admin token (or rotate the token aggressively)

## Troubleshooting

**"Custom auth is not configured"**
One of `CUSTOM_AUTH_ENCRYPTION_KEY`, `CUSTOM_AUTH_ADMIN_TOKEN`, or `DATABASE_URL` is missing. Check Vercel env vars and redeploy.

**"CUSTOM_AUTH_ENCRYPTION_KEY must be a 64-character hex string"**
You pasted a wrong-length key. Regenerate with the `node -e` one-liner from step 1.

**User says the 6-digit code they enter during enrollment is "wrong"**
Device clock drift. The MCP accepts codes within +/- 30 seconds, but if a phone is more than a minute out of sync you get rejections. Ask the user to enable automatic time on their phone.

**User lost their device and their backup codes**
At `/api/admin`, click **Reset 2FA** on their row. Next sign-in they'll re-enroll with a fresh TOTP secret and fresh backup codes. You do NOT need to reset their password.

**"Account temporarily locked"**
Too many wrong passwords. Wait 15 minutes or reset 2FA (which also clears the lock as a side effect of hitting the user's row). There's no "unlock account" button-- the 15-minute timer is the reset.

**"That code didn't match" during enrollment, every time**
You may have pasted a long secret manually and introduced a typo. Reload the QR page (GET /api/oauth/enroll) to generate a fresh secret, then scan with the authenticator app-- scanning avoids the typo class of error entirely.

**Admin UI looks broken after signing in**
The admin cookie is scoped to `/api/admin`-- make sure you're not accidentally visiting `/admin` or similar. The canonical URL is `https://<your-mcp-domain>/api/admin`.
