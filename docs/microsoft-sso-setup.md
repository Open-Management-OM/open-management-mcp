# Microsoft SSO Setup

Let users in your Microsoft Entra (Azure AD) tenant sign in to your MCP. Each user's profile (`admin`, `lead`, `member`, `finance`, `external`, `viewer`) is driven by their Entra security group membership-- no passwords, no per-user config.

## Does this path work for you?

| If your Microsoft account is... | Works? |
|----------|-------|
| Microsoft 365 Business Basic / Standard / Premium | Yes |
| Microsoft 365 E3 / E5 (Enterprise) | Yes-- see Conditional Access note below |
| Work/school tenant created by your IT team | Yes |
| **Personal Hotmail / Outlook.com / Live account only** | **No**-- single-tenant apps reject personal Microsoft accounts. Use Google SSO or Custom Auth instead |
| GCC High / DoD / China 21Vianet | Not supported out of the box-- the MCP hardcodes `login.microsoftonline.com` |

## Prerequisites

- You already deployed this MCP to Vercel (see [SETUP.md](SETUP.md))
- **`PUBLIC_URL` is set** to your deployed MCP URL (no trailing slash, production URL not the random `*.vercel.app` preview unless you're genuinely testing)
- You have one of these Entra roles: **Global Administrator**, **Privileged Role Administrator**, **Cloud Application Administrator**, or **Application Administrator**. (Just "Application Developer" is enough to register the app but NOT enough to grant admin consent in step 4-- you'll have to ask a higher-privileged admin to click the consent button.)
- You know your deployed MCP URL, e.g. `https://mcp.yourdomain.com`

## Two callback layers-- don't confuse them

The OAuth flow has two redirect layers and they live in different places:

```
Claude.ai  -->  MCP server  -->  Microsoft Entra
                  ^                  |
                  +------ callback --+
                   (this is the URI you register in Entra)

Microsoft  -->  MCP server  -->  Claude.ai
                  ^                  |
                  +------ callback --+
                   (this is the URI Claude.ai provides, not something you register)
```

- The redirect URI you register **in the Entra app** is **Microsoft >> MCP**: `https://<your-mcp-domain>/api/oauth/callback/microsoft`.
- Claude.ai's own callbacks-- `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback`-- are passed through by Claude in the request. You do NOT register these in Entra. (Claude routes between `claude.ai` and `claude.com` depending on host; the MCP passes whichever one Claude sent.)

## 1. Create or pick security groups in Entra

The MCP resolves one of six profiles: `admin`, `lead`, `member`, `finance`, `external`, `viewer`. You'll map each Entra group to one of these profile names.

| Role | Typical access |
|------|----------------|
| `admin` | Everything |
| `lead` | All work/people/content; reporting read |
| `member` | All work; people/content read |
| `finance` | All financial; people/reporting read |
| `external` | Work/content read only |
| `viewer` | Read-only across all categories |

**If you already have groups** (e.g. "Engineering", "Finance", "Contractors"): great-- use those. Skip to step 2.

**If you need new groups:**
1. Entra admin center (https://entra.microsoft.com) >> **Identity >> Groups >> All groups >> New group**
2. For each group you need:
   - Group type: **Security**
   - Membership type: **Assigned** (or Dynamic if you know what you're doing)
   - Add the members who should have that level of access
   - Save, then open the group and copy the **Object ID** (a GUID) from its Overview page

You'll use those Object IDs in step 5. Users NOT in any of the groups you map will be denied sign-in.

**Fast way to find the Tenant ID you'll need later:** Click your tenant name in the top-right of the Entra admin center >> the Tenant ID is in the switcher panel. Or grab it from **Identity >> Overview**.

## 2. Register the application

1. Entra admin center >> **Identity >> Applications >> App registrations** >> **New registration**
2. Name: `Claude MCP` (anything you want-- this is shown to users at sign-in)
3. Supported account types: **Accounts in this organizational directory only (Single tenant)**
4. Redirect URI:
   - Platform: **Web**
   - URI: `https://<your-mcp-domain>/api/oauth/callback/microsoft` (use your `PUBLIC_URL`, no trailing slash, case-sensitive)
5. **Register**

From the Overview page, copy:
- **Application (client) ID** >> this becomes your `MICROSOFT_CLIENT_ID`
- **Directory (tenant) ID** >> this becomes your `MICROSOFT_TENANT_ID`

**Multiple environments?** If you run a separate preview deployment, add `https://<preview-url>/api/oauth/callback/microsoft` as an additional redirect URI (same app registration, just more URIs). Each environment gets its own URI-- Entra does not allow wildcards.

## 3. Create a client secret

1. In your app registration >> **Certificates & secrets >> Client secrets >> New client secret**
2. Description: `MCP production`
3. Expires: 24 months (or whatever your org's policy allows)
4. **Add**
5. **Copy the `Value` column immediately.** Not the `Secret ID`-- the `Value`. You cannot view this again after leaving this page; if you lose it you have to generate a new secret. This is your `MICROSOFT_CLIENT_SECRET`.

## 4. Grant API permissions

The MCP reads each user's transitive group memberships via Microsoft Graph, so we need to grant it permission to do that.

1. App registration >> **API permissions >> Add a permission**
2. **Microsoft Graph >> Delegated permissions**
3. Check these scopes:
   - `openid`
   - `email`
   - `profile`
   - `User.Read`
   - `GroupMember.Read.All`
4. **Add permissions**
5. Click **Grant admin consent for <your tenant>** >> **Yes**. This is required for `GroupMember.Read.All`-- without it the Graph call will fail and every user will get "not in an allowed group" even when they are.

After clicking Grant admin consent, the **Status** column for each permission should show "Granted for <tenant>" with a green check. If one row is still blank, click Grant admin consent again.

## 5. Add env vars to Vercel

Vercel >> your project >> **Settings >> Environment Variables**. Add all four to every environment you deploy to (Production, Preview, Development):

| Variable | Value |
|----------|-------|
| `MICROSOFT_TENANT_ID` | From step 2 |
| `MICROSOFT_CLIENT_ID` | From step 2 |
| `MICROSOFT_CLIENT_SECRET` | From step 3 |
| `MICROSOFT_GROUP_PROFILES` | See below |

Also confirm `PUBLIC_URL` is set to your deployed MCP URL (no trailing slash).

### MICROSOFT_GROUP_PROFILES format

Map each Entra group's Object ID to one of the six profile names. JSON object, stringified to a single line:

```json
{
  "abc12345-aaaa-bbbb-cccc-111122223333": "admin",
  "def67890-aaaa-bbbb-cccc-444455556666": "lead",
  "ghi99999-aaaa-bbbb-cccc-777788889999": "viewer"
}
```

If a user belongs to multiple mapped groups, they get the highest-privilege profile in this priority order: `admin > lead > finance > member > external > viewer`.

**Redeploy** the project after adding env vars (Deployments >> latest >> ... >> Redeploy) so the new values take effect.

## 6. Test

1. Visit `https://<your-mcp-domain>/api/oauth/authorize?client_id=<your-OAUTH_CLIENT_ID>&redirect_uri=https://example.com&state=test&code_challenge=test&code_challenge_method=S256`
   (Use your MCP's own `OAUTH_CLIENT_ID` here, NOT the Entra `MICROSOFT_CLIENT_ID`.)
2. If Google or Custom Auth is also configured: you'll see a picker. Click **Sign in with Microsoft**.
3. If only Microsoft is configured: you'll be sent straight to Microsoft.
4. Sign in with a user who is in one of your mapped groups.
5. You should be redirected to `https://example.com/?code=...` -- that's success. (`example.com` is just a stand-in for Claude.ai during testing-- any URL works, it's just the echo target.)

Try again with a user who is NOT in any mapped group. You should get a "not in an allowed group" error page.

## Conditional Access heads-up (E3 / E5 tenants)

If your tenant uses Conditional Access policies (common on E3/E5), those policies apply to sign-ins via this app too. If CA requires MFA, device compliance, or specific locations, users will hit those requirements before they reach the MCP. That's usually what you want-- but if sign-ins are silently blocked, check your CA policies and either exempt the app or add users to the appropriate targeted groups.

## Troubleshooting

**AADSTS700016: Application not found in the directory**
`MICROSOFT_CLIENT_ID` doesn't match the app registration, or the registration was deleted. Check both values.

**AADSTS50011: Redirect URI ... does not match**
The redirect URI in the app registration must be **exactly** `https://<your-domain>/api/oauth/callback/microsoft`-- no trailing slash, scheme matters, subdomain matters. If you're on a preview deploy, make sure you added that preview URL to the app registration's redirect URIs.

**"Need admin approval"**
You skipped Grant admin consent in step 4. Go back and click it.

**User signs in but gets "not in an allowed group"**
They're not in any group listed in `MICROSOFT_GROUP_PROFILES`. Either add them to a group, or add their group's Object ID to the env var and redeploy. You can also check the MCP's audit log for the user's resolved group IDs to verify Graph is returning what you expect.

**Transitive group membership not resolving**
The MCP calls `/me/transitiveMemberOf/microsoft.graph.group?$top=100`, so nested group membership works. If a user has more than 100 groups, only the first 100 are considered. Fix: map them to a smaller, more specific group.

**Sign-in works locally but fails from Claude.ai**
Check that `PUBLIC_URL` in Vercel matches the production URL and doesn't have a trailing slash. The callback URI the server builds must match what's registered in Entra exactly.
