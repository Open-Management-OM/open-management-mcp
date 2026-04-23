# Kickstart Prompt

After you fork this repo and open it in Claude Code, **paste everything below the horizontal rule** as your first message. Claude will ask you a handful of questions, then walk you end-to-end from "empty fork" to "deployed MCP that my Claude.ai connects to."

Claude will create a `SETUP-PROGRESS.md` file in the repo as its first action-- a living checklist of every step, checked off as we complete it. That file is gitignored (it's your personal progress, not part of the code). If you stop mid-flow, paste this prompt again in a new Claude Code session and Claude will read the progress file and resume from the next unchecked item.

---

I just forked this repo. I want you to walk me through the complete setup from scratch so my team can connect to this MCP server from Claude.ai (desktop, web, or mobile). Do this **interactively, one question at a time**, confirm my answers before moving on, and **never run destructive commands** (`vercel deploy`, `git push`, `vercel env add` against production) without my explicit confirmation.

## Who you're talking to

**Assume I am completely non-technical. I'm relying heavily on you to tell me what's best.** When a technical question comes up, ask it like you're explaining a new concept to someone who has never seen it:

1. Give me one or two sentences of context in plain English first. ("An OAuth client is basically a username-and-password for our app, so Google knows we're allowed to ask it about a user who signs in.")
2. Then ask the question with a **recommended default + a short "here's why"**. ("I suggest Google SSO because your team is already on Google Workspace-- everyone can sign in without needing a new account. Say 'go with that' unless you have a reason to prefer something else.")
3. If I seem stuck, don't tell me to "click the Credentials tab." Walk me through the UI step by step-- "open a new browser tab, go to console.cloud.google.com, look at the left-hand sidebar, you'll see a section called..."

Rules for tone:
- Define every jargon term the first time it appears. Bearer token, OAuth, RBAC, TOTP, watermark, upsert, env var-- no assumed knowledge.
- Err on the side of explaining MORE, not less. I'd rather read two extra sentences than hit a dead end.
- When there's a tradeoff I could reasonably choose either side on, pick one for me and tell me why. Don't paralyze me with options.
- Make me feel supported, not tested. Ask questions like a patient tutor, not a quiz master.
- If a step has gone wrong, diagnose with me gently-- "let's look at what the error actually says" rather than "check your env vars, try again."

## First thing you do: check prereqs + create a progress checklist

**Before anything else**, confirm my API credentials file exists:

```bash
ls -la ~/.config/the-intensive/credentials.env
```

If the file is missing, **stop immediately** and tell me: "Run the-intensive/prereqs KICKSTART first to generate your Vercel / Neon / GitHub tokens, then come back here." Don't try to proceed without credentials-- downstream phases rely on them.

If the file exists, source it so the tokens are available in this shell:

```bash
source ~/.config/the-intensive/credentials.env
```

Verify the expected variables are set (`VERCEL_TOKEN`, `NEON_API_KEY`, `GITHUB_TOKEN`, `GITHUB_USERNAME`). If any are empty, flag to me that the prereqs setup is incomplete.

Then create `SETUP-PROGRESS.md` at the root of this repo. Populate it with every phase and sub-step from this prompt, each rendered as a `- [ ]` checkbox item. After each step we complete, **update the file** to check the box and optionally add a short note ("completed 2026-04-23, picked Google SSO for our Workspace"). This gives me a living record of where we are. If I close Claude Code and come back tomorrow, my future Claude session can read `SETUP-PROGRESS.md` and know exactly where to resume.

Add `SETUP-PROGRESS.md` to `.gitignore` if it isn't already-- it stays local, not committed.

Read the following docs as you need them-- they're authoritative:

- `docs/SETUP.md` -- deployment flow
- `docs/google-sso-setup.md` -- Google SSO
- `docs/microsoft-sso-setup.md` -- Microsoft SSO
- `docs/custom-auth-setup.md` -- password + TOTP 2FA
- `docs/cloudflare-proxy-setup.md` -- CF orange-cloud in front of Vercel
- `docs/FRAMEWORK.md` and `AI_README.md` -- only if I say I want to adapt this for a different API (most people don't)
- `src/warehouse-guide.ts` -- the file I'll customize with my data warehouse specifics

If there's a conflict between something I say and something in the docs, the docs win-- tell me.

## Phase 1 -- Gather my context

Ask me **one question at a time**, wait for my answer, then the next:

1. What's my organization / team name? (I'll use this for repo renaming, env vars, authenticator-app labels.)
2. What custom domain do I want the MCP to live at? (`mcp.acme.com`-type-- or "none, I'll stay on the production vercel.app URL for now". **Not preview URLs-- those change per deployment and break Claude.ai's connector.**)
3. How big is my team? (Affects which auth method I'd recommend.)
4. Which auth method do I want?
    - **Google SSO** -- integrates with Google Workspace. I'll create an OAuth client in Google Cloud and manage access via email allowlist.
    - **Microsoft SSO** -- integrates with Microsoft 365 / Entra. I'll register an app in Entra and manage access via security groups.
    - **Custom Auth (password + 2FA)** -- **already built in-- no external IdP needed**. Everything is baked into this repo: user-management admin UI at `/api/admin`, bcrypt password hashing, TOTP enrollment on first login, AES-256-GCM encrypted secrets, 10 backup codes, account lockout. I just generate two secrets, set env vars, deploy, and start inviting users. Best choice if I want the fastest path from fork to working, or I need access for people outside my IdP (contractors, clients, partners).
    - (I can set up more than one-- users see a picker. But start with my primary.)
5. What **Vercel plan** am I on? Matters for function timeouts and eventually cron slots (if I later add scheduled tasks to this MCP).
    - **Hobby (free)**: 10s default timeout / 60s on cron. Fine for MCP reads on small schemas. **Fetch the current Vercel pricing page with WebFetch** (limits drift) and summarize the relevant numbers for me.
    - **Pro ($20/user/month)**: 60s default / up to 300s. Right for production teams or larger warehouses.
    - **Enterprise**: bespoke. Handles anything.
    - If I say "I don't know", walk me through vercel.com dashboard >> Settings >> Usage to check.
6. What's the repo naming convention I'm using? The project convention is `{org}-mcp`-- e.g. `acme-mcp`, `sparkle-mcp`. Is my forked repo already named that? If not (still `neon-mcp` because I forked without renaming), we'll rename in Phase 2.
7. Do I want to put this behind Cloudflare's orange-cloud proxy now, or skip for later? (Optional-- adds ~10 min.)

(Accounts + tokens are assumed done-- if prereqs passed, I have Neon + Vercel accounts and the API keys to drive them. If we hit a "no account" error later, it means prereqs wasn't actually complete, and we loop back.)

After I answer these, **summarize my answers in a single message** and confirm before proceeding.

## Phase 2 -- Rename repo + Neon project

### 2a. Rename to match the `{org}-mcp` convention (skip if already done)

If my forked repo name isn't `{org}-mcp` yet, fix it now:

1. **Rename the GitHub repo** (pick one):
    - GitHub UI: `{my-username}/{current-name}` >> Settings >> Rename to `{org}-mcp`
    - CLI: `gh api -X PATCH /repos/{my-username}/{current-name} -f name={org}-mcp`

    GitHub auto-redirects old URLs so nothing actively breaks.
2. **Update the local origin remote**:

    ```bash
    git remote set-url origin https://github.com/{my-username}/{org}-mcp.git
    ```
3. **Update `package.json`**: change `"name": "@the-intensive/neon-mcp"` to `"name": "@{my-username}/{org}-mcp"` (or just `"{org}-mcp"` if not using a scoped name).
4. Optional: rename the local directory (`mv` the folder, then `cd` into the new name). Skip if shortcuts would break.
5. Commit and push: `git add package.json && git commit -m "rename: {org}-mcp" && git push`.

### 2b. Neon project

The `NEON_API_KEY` is already in my environment from prereqs (sourced from `credentials.env`)-- no need to grab it again from the Neon console.

1. **Check if the project already exists.** Curl the Neon API to see if a project matching my org name is already there:

    ```bash
    curl -s -H "Authorization: Bearer $NEON_API_KEY" https://console.neon.tech/api/v2/projects | grep -i "{org}"
    ```

    If I see one named like `{org}-warehouse` or `{org}-mcp`, I probably already created it. Ask me whether to reuse or start fresh. If reusing, fetch its `id` from the response above and skip to step 3.

2. **Create the project via API** (if I need a new one):

    ```bash
    curl -s -X POST -H "Authorization: Bearer $NEON_API_KEY" -H "Content-Type: application/json" \
      -d '{"project":{"name":"{org}-warehouse","region_id":"aws-us-east-1"}}' \
      https://console.neon.tech/api/v2/projects
    ```

    Show me the response. The project's `id`, default `role`, default `database.name`, and the `connection_uris` are all in it. Walk me through what each field means.

    (Region note: `aws-us-east-1` is a good default. If I mentioned a different region in Phase 1 or my team is heavily EU-based, pick the closer one-- Neon regions are listed in their docs.)

3. **Get the pooled connection string.** From the API response in step 2, the `connection_uris` array has both direct and pooled variants. **We want the pooled one**-- it's designed for serverless like Vercel. Save it as `DATABASE_URL` in our working set of env vars.

4. Keep both `DATABASE_URL` and the project's `id` in the conversation for Phase 4.

## Phase 3 -- Auth provider setup

Based on my Phase 1 answer, walk me through the relevant doc:

- **Google**: open `docs/google-sso-setup.md` and take me through steps 1-4 (Google Cloud project, Google Auth Platform branding + audience, OAuth client + **download the JSON immediately**, env vars including `GOOGLE_EMAIL_PROFILES` with my team's emails and their profile roles).
- **Microsoft**: open `docs/microsoft-sso-setup.md` and take me through steps 1-5 (security groups, app registration, client secret, API permissions + admin consent, env vars including `MICROSOFT_GROUP_PROFILES`).
- **Custom Auth**: open `docs/custom-auth-setup.md`. Generate:
    - `CUSTOM_AUTH_ENCRYPTION_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    - `CUSTOM_AUTH_ADMIN_TOKEN` with `openssl rand -base64 32`
    - Save both in a password manager.

At each sub-step, **confirm I've completed it** before moving to the next. Don't run ahead.

## Phase 4 -- Vercel deployment

1. Check if Vercel CLI is installed (`vercel --version`). If not, help me install (`npm i -g vercel`) and authenticate (`vercel login`).
2. Link this repo to a Vercel project (`vercel link` or `vercel` for first deploy). Pick a project name that matches my org.
3. Generate an `MCP_AUTH_TOKENS` value. Use `openssl rand -base64 32` for the bearer token and build the JSON:
    ```json
    {"tokens":[{"token":"<generated>","profile":"admin","label":"My Name"}]}
    ```
4. Generate `OAUTH_CLIENT_ID` (I'll pick something like `acme-mcp-client`) and `OAUTH_CLIENT_SECRET` (`openssl rand -base64 32`).
5. Decide `PUBLIC_URL`:
    - If I picked a custom domain in Phase 1: it's `https://mcp.mydomain.com` (no trailing slash).
    - If I didn't: use the **production** vercel.app URL-- the one Vercel assigns to the project itself, NOT a preview deployment URL. Preview URLs look like `my-project-git-main-myteam.vercel.app` (contains `-git-`) and change on every push; the production URL is `my-project.vercel.app` and is stable. Using a preview URL as PUBLIC_URL will break Claude.ai's connector the moment you push a new deploy. When in doubt, the production URL is the one shown at the top of the Vercel project's Overview page, not anything from the Deployments list.
6. Use `vercel env add` (or paste into the dashboard) to set, in **all three** environments (Production, Preview, Development):
    - `NEON_API_KEY`
    - `DATABASE_URL`
    - `MCP_AUTH_TOKENS`
    - `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `PUBLIC_URL`
    - `OAUTH_JWT_SECRET` (can default to `NEON_API_KEY` if I don't set it explicitly-- or generate a separate one)
    - The auth-provider vars from Phase 3
7. **Before `vercel deploy --prod`, show me the command and wait for my explicit confirmation.** Then run it and watch the output together.
8. Verify: `curl -i https://{my-domain}/api/mcp` -- expect `401 Unauthorized` (bearer required). A 401 here means the server is up and routing correctly. If it's a 5xx or redirect loop, stop and diagnose.

## Phase 5 (optional) -- Cloudflare proxy

If I said yes to Cloudflare in Phase 1, follow `docs/cloudflare-proxy-setup.md` end-to-end. Key things to watch for:

- **SSL/TLS mode MUST be Full (Strict)** before flipping the orange cloud. Flexible causes infinite redirects.
- TXT verification records stay grey cloud (DNS only). Only the A / CNAME record gets the orange cloud.
- After the custom domain is live, update `PUBLIC_URL` in Vercel (and redeploy) **and** update the OAuth client's redirect URI in Google / Entra / wherever to match.

## Phase 6 -- Seed the admin user (Custom Auth only)

Skip this phase if I'm on Google or Microsoft SSO.

1. Open `https://{my-domain}/api/admin` in a browser.
2. Enter the `CUSTOM_AUTH_ADMIN_TOKEN` we generated in Phase 3.
3. Create my first user (likely me, as `admin` profile). Use a temp password I'll remember-- no password reset flow today.
4. Sign out. Sign back in as that user to test the email+password >> TOTP enrollment >> backup codes flow.
5. Confirm backup codes are saved somewhere safe (password manager, secrets vault, etc.).

## Phase 7 -- Customize the warehouse guide

Open `src/warehouse-guide.ts`. It's a 360-line template with methodology comments at the top. Walk me through:

1. What data warehouse am I planning to query? (Neon project? Same one we set up, or a separate data warehouse?)
2. Do I already have data in it, or am I starting empty? (If empty, we defer the warehouse-guide customization until after we've built the data mover that populates Neon.)
3. If I have data: let's write 3-5 **user stories** first ("As a [role], I want to know [question] so I can [action]"). These drive everything else.
4. For each story, identify the **business terms** that have specific meanings ("active customer", "reactive ticket", etc.). Get the exact definition from the stakeholder-- don't guess.
5. For each term, write the SQL and **verify the output with the stakeholder** before putting it in the guide with a "NEVER re-derive" rule.
6. Commit the updated `warehouse-guide.ts`, redeploy.

If I'm starting empty, tell me: "Come back to this after you've built a data-mover and have real tables to document."

For the specific workflow of locking in business-term definitions as deterministic SQL (e.g. "reactive ticket", "MRR"), point me at `docs/building-deterministic-queries.md`-- that doc has copy-paste prompts I use **inside Claude.ai** (not Claude Code) to verify each definition against real data before committing it to the warehouse guide.

## Phase 8 -- Connect from Claude.ai

1. Desktop or web Claude.ai >> Settings >> Connectors >> Add custom connector.
2. URL: `https://{my-domain}/api/mcp`
3. In **Advanced settings**:
    - OAuth Client ID = `OAUTH_CLIENT_ID` from Phase 4
    - OAuth Client Secret = `OAUTH_CLIENT_SECRET` from Phase 4
4. Save. Claude opens a sign-in window based on whichever auth method(s) I configured.
5. Complete the sign-in (Google OAuth / Microsoft OAuth / password+TOTP for Custom Auth).
6. Back in Claude.ai, ask a test question: "Use my new MCP to list my Neon projects." Confirm the response is real data.

If anything goes wrong, pull up:

- **401 from Claude**: OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET mismatch between Vercel and Claude's Advanced settings.
- **"invalid redirect"**: `PUBLIC_URL` in Vercel doesn't match the actual hostname, OR the Google/Entra client's redirect URI isn't `https://{my-domain}/api/oauth/callback/{provider}`.
- **"not in an allowed group" / "not on allowlist"**: I haven't added my own email/group to `GOOGLE_EMAIL_PROFILES` / `MICROSOFT_GROUP_PROFILES`.

## Guardrails -- what NOT to do

- Don't run `vercel deploy --prod` without showing me the command first.
- Don't run `git push` without my explicit say-so.
- Don't write env vars directly to production environments without summarizing the value first-- even redacted.
- If a step errors, **stop and diagnose with me**. Don't retry the same command hoping it'll work.
- Don't skip verification steps. A deploy that returns 200 on the root path isn't the same as an MCP that Claude.ai can connect to.
- Don't customize the auth layer, RBAC engine, or OpenAPI tool generator-- those are framework code, not my fork's concern. If I think I need to, flag it and we'll discuss.
- Don't touch `src/security/` or `app/api/oauth/`-- those are working code. If I'm tempted to "fix" something there, stop and tell me.

Start with Phase 1, question 1. Let's go.
