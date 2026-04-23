# Google SSO Setup

Let users sign in to your MCP with their Google account (Workspace or personal). Access and profile (`admin`, `lead`, `member`, `finance`, `external`, `viewer`) are controlled by an explicit email allowlist-- if the email isn't on the list, they can't sign in.

Google Workspace groups aren't used here because they require Admin SDK scopes and domain-wide delegation, which is heavier than most teams need. If you want group-based access, use Microsoft SSO or Custom Auth instead.

## Does this path work for you?

| If you have... | Path |
|----------------|------|
| Google Workspace with a verified primary domain | **Internal** user type, skip publishing |
| Google Workspace with multiple domains under one tenant | **Internal**-- secondary domains under the same tenant count as internal |
| Personal Gmail (no Workspace) | **External** user type, **Publish** the app to avoid the 100-test-user cap |
| Subsidiary or partner on a separate Workspace tenant | Those users count as External-- use External + Publish |
| No Google account at all yet | You'll be prompted to create one during the Google Cloud setup |

## Prerequisites

- You already deployed this MCP to Vercel (see [SETUP.md](SETUP.md))
- **`PUBLIC_URL` is set** to your deployed MCP URL (no trailing slash)
- A Google Cloud project (you can create one during setup)
- You know your deployed MCP URL, e.g. `https://mcp.yourdomain.com`

You do NOT need to enable any APIs in Google Cloud. OpenID Connect is implicit in the OAuth 2.0 flow, and we don't use the Workspace Admin SDK. Skip the API Library entirely.

## Two callback layers-- don't confuse them

The OAuth flow has two redirect layers that live in different places:

```
Claude.ai  -->  MCP server  -->  Google
                  ^                  |
                  +------ callback --+
                   (this is the URI you register in Google Cloud)

Google  -->  MCP server  -->  Claude.ai
                  ^                  |
                  +------ callback --+
                   (this is the URI Claude.ai provides, not something you register)
```

- The redirect URI you register **in Google Cloud** is **Google >> MCP**: `https://<your-mcp-domain>/api/oauth/callback/google`.
- Claude.ai's own callbacks-- `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback`-- are passed through by Claude in the OAuth request. You do NOT register these anywhere in Google Cloud.

## 1. Create or pick a Google Cloud project

1. Go to https://console.cloud.google.com
2. Project selector (top bar) >> **New Project** (or pick an existing one). For a fresh setup, name it `Claude MCP`.

## 2. Configure the Google Auth Platform

**As of 2024, Google renamed "APIs & Services >> OAuth consent screen" to the Google Auth Platform.** The old path may still redirect, but the primary entry is:

Left nav >> **Google Auth Platform** (or hunt for it via the top search bar)

### 2a. Branding

Google Auth Platform >> **Branding**

- **App name**: `Claude MCP` (this is shown to users at sign-in)
- **User support email**: your email
- **Developer contact information**: your email
- Save. Everything else is optional.

### 2b. Audience

Google Auth Platform >> **Audience**

Pick **User type**:

| If you have... | Pick |
|----------------|------|
| Google Workspace with a verified domain | **Internal**-- only users at your org can sign in, no publishing needed, done |
| Personal Gmail or mixed/external users | **External** |

**If you picked Internal:** you're done with this section. Skip to step 3.

**If you picked External:** you'll see a "Testing" status banner and a 100-test-user cap. Two ways to proceed:

- **Add each user as a test user** (works for small teams, max 100 accounts)
- **Click "Publish app"** >> confirm. Because we only use non-sensitive scopes (`openid email profile`), publishing does NOT trigger Google's app verification review. The app moves to "In production" status immediately and the 100-user cap is lifted.

The "unverified app" warning interstitial still appears for External apps that haven't gone through brand verification-- that's expected and fine for non-sensitive scopes. Users click "Advanced >> Go to Claude MCP (unsafe)" once, then they're through.

## 3. Create the OAuth client

Google Auth Platform >> **Clients** (legacy path: APIs & Services >> Credentials) >> **Create client**

- **Application type**: **Web application**
- **Name**: `Claude MCP`
- **Authorized redirect URIs** >> Add URI >> `https://<your-mcp-domain>/api/oauth/callback/google`
  - Scheme (`https` vs `http`), subdomain, path, and trailing slash all must match exactly
  - Add additional URIs for preview/staging environments if you use them
- **Create**

A modal appears with your **Client ID** and **Client secret**.

### Critical-- download the JSON now

**As of June 2025, Google stores client secrets as hashed values.** After you close this modal, the console will only show the last 4 characters of the secret. There is no "view again" button. If you lose the secret you must create a new one.

**Click "Download JSON" immediately.** The file contains both the Client ID and the Client Secret in full. Store it in your password manager. Do NOT skip this step-- it's the single biggest operational gotcha in Google Cloud's new UI.

## 4. Add env vars to Vercel

Vercel >> your project >> **Settings >> Environment Variables**. Add all three to every environment (Production, Preview, Development):

| Variable | Value |
|----------|-------|
| `GOOGLE_CLIENT_ID` | From step 3 (ends in `.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | From step 3 (the full secret, from the JSON you downloaded) |
| `GOOGLE_EMAIL_PROFILES` | See below |

Also confirm `PUBLIC_URL` is set.

### GOOGLE_EMAIL_PROFILES format

Map each allowed email to one of the six profile names. JSON object, stringified to a single line:

```json
{
  "you@yourco.com": "admin",
  "teammate@yourco.com": "lead",
  "auditor@yourco.com": "viewer"
}
```

| Profile | Typical access |
|---------|----------------|
| `admin` | Everything |
| `lead` | All work/people/content; reporting read |
| `member` | All work; people/content read |
| `finance` | All financial; people/reporting read |
| `external` | Work/content read only |
| `viewer` | Read-only across all categories |

Emails are matched case-insensitively. Anyone whose email isn't a key in this object is blocked.

Apply to: Production, Preview, Development. **Redeploy** the project (Deployments >> latest >> ... >> Redeploy) so the new env vars take effect.

## 5. Test

1. Visit `https://<your-mcp-domain>/api/oauth/authorize?client_id=<your-OAUTH_CLIENT_ID>&redirect_uri=https://example.com&state=test&code_challenge=test&code_challenge_method=S256`
   (Use your MCP's own `OAUTH_CLIENT_ID` here, NOT the Google `GOOGLE_CLIENT_ID`.)
2. If Microsoft or Custom Auth is also configured: you'll see a picker. Click **Sign in with Google**.
3. If only Google is configured: you'll be sent straight to Google.
4. Sign in with a Google account that's in your allowlist.
5. You should be redirected to `https://example.com/?code=...` -- that's success.

Try again with a Google account that's NOT in the allowlist. You should get a "not on allowlist" error page.

## Token lifetime note

The MCP requests `access_type=online`, which means Google does not issue a refresh token. We only use Google's ID token (once, during sign-in, to read the verified email claim). The access token Claude.ai then uses for MCP calls is the MCP's own JWT, managed separately. This is fine for our use case-- don't let the missing refresh-token path confuse you.

## Troubleshooting

**Error 400: redirect_uri_mismatch**
The redirect URI in the Google Cloud client must be **exactly** `https://<your-mcp-domain>/api/oauth/callback/google`. Trailing slash matters. Subdomain matters. `http` vs `https` matters.

**"Access blocked: This app's request is invalid"**
Usually means the Audience isn't published (for External apps). See step 2b.

**"This app isn't verified"**
Expected warning for External apps that haven't gone through brand verification. For non-sensitive scopes (`openid email profile`) this is fine-- click **Advanced >> Go to Claude MCP (unsafe)**. For a cleaner experience, submit the app for brand verification in the Audience settings.

**User signs in but gets "not on allowlist"**
Their email isn't a key in `GOOGLE_EMAIL_PROFILES`. Add it and redeploy. Emails match case-insensitively, but `+` aliases are treated as distinct (`you+tag@example.com` is NOT matched by `you@example.com`).

**email_not_verified**
Rare-- happens if the Google account hasn't verified its email. The user verifies with Google first.

**Client secret is wrong / only 4 chars visible in console**
Google stores the secret hashed; after creation only the last 4 chars are displayed. You need to refer back to the JSON you downloaded at creation time. If you didn't download it, create a new secret (Google Auth Platform >> Clients >> your client >> Add secret) and update the Vercel env var.

**Sign-in works in one browser but not another**
Third-party cookies get blocked in strict browser privacy modes. The MCP uses a first-party state cookie on its own domain, so this is usually not the issue-- but if Claude.ai is hosting the sign-in in a webview with aggressive isolation, try the desktop app or a different browser to confirm.
