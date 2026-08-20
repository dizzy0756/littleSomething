# Deployment Runbook — Little Something For You

Target architecture for this deployment (decided with you):

| Piece | Where | Plan | URL (after deploy) |
|---|---|---|---|
| Frontend (`apps/web`) | Cloudflare Pages, git-connected | Free | `https://little-something-web.pages.dev` |
| Backend (`apps/api`) | Render Web Service | Free | `https://little-something-api.onrender.com` |
| Database | Neon Postgres (pooled) | Free | — |
| Media | Cloudflare R2 + `r2.dev` public URL | Free | `https://pub-xxxx.r2.dev` |
| Payments | Razorpay **test mode** | — | — |
| Email | SMTP (optional, last phase) | Free tier | — |

Custom domain (`littlesomething.app`) is intentionally **out of scope** for this pass and
documented as Phase 7 for later.

**Key design decision:** the Pages Function (`apps/web/functions/[[path]].js`) proxies
`/s/*`, `/api/*`, `/uploads/*`, `/templates/*` to Render. So we leave `VITE_API_BASE_URL`
**empty** and the browser talks only to the Pages origin → same-origin, zero CORS, and the
Razorpay publishable key already comes from the API (`create-order` returns `key_id`),
not from a build-time variable.

Legend: 🔧 = I change code · 🧑 = you do it in a browser dashboard · ✅ = verification gate

---

## Phase 0 — Pre-flight code fixes (nothing is deployed yet)

Four real blockers exist in the current code. All four are fixed before the first push.

### Step 0.1 🔧 Fix the Render build (blocker #1)

`apps/api/render.yaml` uses `rootDir: apps/api` + `npm install`. `apps/api` depends on
`@little-something/shared`, a **private workspace package that is not published to npm**, and
`apps/api/package-lock.json` has no entry for it. Installing inside `apps/api` alone → `E404`.
Install must happen from the repo root so npm workspaces symlinks it.

Rewrite `apps/api/render.yaml` to:

```yaml
services:
  - type: web
    name: little-something-api
    runtime: node
    plan: free
    region: oregon
    branch: main
    # NOTE: no rootDir. Install from the repo ROOT so npm workspaces can link
    # the private @little-something/shared package into apps/api.
    buildCommand: npm install
    startCommand: npm start --workspace apps/api
    healthCheckPath: /api/health
    envVars:
      - key: NODE_VERSION
        value: "22"
      - key: NODE_ENV
        value: production
      # Neon pooled connection string — entered in the dashboard.
      - key: DATABASE_URL
        sync: false
      - key: DATABASE_SSL
        value: "true"
      - key: JWT_SECRET
        generateValue: true
      - key: ALLOWED_ORIGINS
        sync: false
      - key: WEB_BASE_URL
        sync: false
      - key: PAYMENT_AMOUNT
        value: "9900"
      - key: PAYMENT_CURRENCY
        value: INR
      - key: PRIVATE_LINK_EXPIRY_DAYS
        value: "7"
      - key: RAZORPAY_KEY_ID
        sync: false
      - key: RAZORPAY_KEY_SECRET
        sync: false
      - key: RAZORPAY_WEBHOOK_SECRET
        sync: false
      - key: R2_ACCOUNT_ID
        sync: false
      - key: R2_ACCESS_KEY_ID
        sync: false
      - key: R2_SECRET_ACCESS_KEY
        sync: false
      - key: R2_BUCKET
        sync: false
      - key: R2_PUBLIC_URL
        sync: false
      - key: SMTP_HOST
        sync: false
      - key: SMTP_PORT
        sync: false
      - key: SMTP_USER
        sync: false
      - key: SMTP_PASSWORD
        sync: false
      - key: EMAIL_FROM
        sync: false
```

Changes vs today: no `rootDir`, root-level install, `plan: free`, `NODE_VERSION` pinned,
hardcoded `PORT` removed (Render injects it; `index.js` already reads `process.env.PORT`),
and the `databases:` block + `fromDatabase` removed because we use Neon.

### Step 0.2 🔧 Add TLS support for Neon (blocker #2)

`apps/api/src/lib/database.js` creates the `Pool` with no `ssl` option. Neon **requires** TLS,
so the API would fail to connect. Patch the pool:

```js
const connectionString = process.env.DATABASE_URL || "";
// Managed Postgres (Neon/Supabase) requires TLS. Enable it when the connection
// string asks for it, or explicitly via DATABASE_SSL=true. Local Postgres stays plain.
const useSSL =
  process.env.DATABASE_SSL === "true" ||
  /[?&]sslmode=(require|verify-ca|verify-full)/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.PG_POOL_MAX || "10", 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
```

`rejectUnauthorized: false` is the standard node-postgres setting for Neon/Supabase (no CA
bundle shipped); the connection is still encrypted. Local dev is unaffected.

### Step 0.3 🔧 Trust the proxy chain (blocker #3 — would lock out all users)

Because every API request arrives via the Cloudflare Pages Function, Render sees one source
IP. With no `trust proxy` setting, `express-rate-limit` in `apps/api/src/routes/auth.js`
(`max: 10` per 15 min) buckets **every visitor worldwide into a single counter** — after 10
signups/logins the whole site's auth is locked for 15 minutes. `link_views.ip_address` would
also log the proxy IP, breaking analytics.

In `apps/api/index.js`, right after `const app = express();`:

```js
// Cloudflare Pages Function -> Render router puts 2 proxies in front of the app.
// Without this, req.ip is the proxy IP: express-rate-limit would throttle all
// users under one bucket and link_views would record the proxy address.
app.set("trust proxy", true);
```

And in `apps/api/src/routes/auth.js`, key the limiter on the Cloudflare-verified client IP
(Cloudflare overwrites `CF-Connecting-IP` at its edge, so it cannot be spoofed through Pages):

```js
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
// ...
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => ipKeyGenerator(req.headers["cf-connecting-ip"] || req.ip || ""),
  // ...existing options
});
```

I will confirm `ipKeyGenerator` is exported by the installed `express-rate-limit` v8 before
using it, and fall back to a plain `keyGenerator` if not.

### Step 0.4 🔧 Fix the Cloudflare Pages build (blocker #4)

`apps/web/package.json` declares `"@little-something/shared": "*"` but **no file in
`apps/web` imports it** (verified). Cloudflare Pages will build with root directory
`apps/web` — where that unpublished dependency makes `npm install` fail with `E404`.

- Remove the unused `dependencies` block from `apps/web/package.json`.
- Add `apps/web/.node-version` containing `22` so the Pages build image is deterministic.

Root directory `apps/web` (rather than the repo root) is required so Cloudflare discovers
`apps/web/functions/` — Pages only picks up a `functions/` folder at the configured root.

### Step 0.5 🔧 Wire the Pages Function's API origin into `wrangler.toml`

When a Pages project contains a `wrangler.toml`, **runtime variables set in the dashboard are
ignored** — so `API_BASE_URL` must live in the file. Update `apps/web/wrangler.toml`:

```toml
name = "little-something-web"
pages_build_output_dir = "dist"
compatibility_date = "2024-09-01"

# Runtime var for functions/[[path]].js. Dashboard vars are IGNORED when this
# file exists, so the API origin must be declared here.
[vars]
API_BASE_URL = "https://little-something-api.onrender.com"

[env.preview.vars]
API_BASE_URL = "https://little-something-api.onrender.com"
```

Also drop the legacy `type = "javascript"` key (wrangler 3 warns about it), and change the
hardcoded fallback in `functions/[[path]].js` from `https://api.littlesomething.app` to the
Render URL so a missing var degrades gracefully instead of 404ing.

> The exact Render URL isn't known until Phase 2. I'll fill in the real value in Step 2.5 and
> push, which triggers a Pages rebuild. If Render hands out a different name than
> `little-something-api`, only this one line changes.

### Step 0.6 ✅ Verify locally, then commit and push

```powershell
npm install                 # root, links workspaces
npm run lint                # syntax-checks all API files
npm run build:web           # must emit apps/web/dist with 13 html files
```

Then commit. Per your decision the doc deletions (`README.md`, `ARCHITECTURE.md`,
`docs/RAZORPAY_*.md`) are committed as deletions, together with the new `contact.html` /
`refund.html` (needed for Razorpay merchant onboarding) and the Phase 0 fixes.

```powershell
git add -A
git commit -m "chore(deploy): fix workspace installs, Neon TLS, proxy trust; add legal pages"
git push origin main
```

✅ Gate: `git status` clean, `origin/main` up to date, `apps/web/dist` builds.

---

## Phase 1 — Database (Neon)

### Step 1.1 🧑 Create the Neon project
neon.com → sign up (GitHub login is fine) → **Create project**
- Name: `little-something`
- Postgres 17, region **AWS us-west-2 (Oregon)** — matches the Render region, minimising
  round-trip latency for every query on a page render.
- Database name: `little_something`

### Step 1.2 🧑 Copy the **pooled** connection string
Dashboard → **Connect** → enable *Connection pooling* → copy the URI. It must contain
`-pooler` in the host and end with `?sslmode=require`, e.g.
`postgresql://neondb_owner:PASS@ep-xxx-pooler.us-west-2.aws.neon.tech/little_something?sslmode=require`

Pooled is required: the free tier's direct-connection limit is small and Render restarts
often. Paste it to me (or keep it and paste it into the dashboards yourself in Step 2.3).

### Step 1.3 🔧 Point local `.env` at Neon and create the schema
Set `DATABASE_URL` (Neon pooled) and `DATABASE_SSL=true` in `apps/api/.env`, then:

```powershell
node apps/api/index.js      # db.init() creates all tables + runs migrations
```
✅ Gate: log shows `Little Something API running...` with no Postgres error. Ctrl+C.

`infra/db/schema.sql` stays as reference only — `db.init()` is the source of truth and is
idempotent.

### Step 1.4 🔧 Seed the admin user (must be done now, not later)
Render's **free plan has no shell access**, so the admin user is seeded from your machine
against the same Neon database:

```powershell
node apps/api/seed.js
```
✅ Gate: prints `Admin created: pritamlaiz007@gmail.com`. (Your `.env` already has
`ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME=Dizzy`. Say the word if you want a fresh
password generated first — the current one is committed nowhere, `.env` is gitignored.)

---

## Phase 2 — Backend on Render

### Step 2.1 🧑 Create the Render account
render.com → sign up **with GitHub** → authorise access to `dizzy0756/littleSomething`.

### Step 2.2 🧑 Deploy via Blueprint
Dashboard → **New → Blueprint** → pick the repo → Render reads `apps/api/render.yaml`
(committed in Step 0.1) → name the blueprint `little-something`.

If Blueprint detection misbehaves, the manual fallback is **New → Web Service** with:
root directory *(blank)*, build `npm install`, start `npm start --workspace apps/api`,
health check `/api/health`, plan Free, region Oregon.

### Step 2.3 🧑 Enter the secrets Render prompts for
| Key | Value |
|---|---|
| `DATABASE_URL` | Neon pooled URI from Step 1.2 |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3001` *(pages.dev added in Step 3.4)* |
| `WEB_BASE_URL` | `https://little-something-web.pages.dev` *(corrected in Step 3.4 if the name differs)* |
| `RAZORPAY_*`, `R2_*`, `SMTP_*` | leave blank for now — Phases 4–6 |

`JWT_SECRET` is auto-generated by Render. Everything else has a default in the blueprint.

### Step 2.4 ✅ First deploy
Watch **Logs**. Expect `Little Something API running on http://localhost:10000` and the
`RAZORPAY_... not set — payment features will be disabled` warning (expected at this stage).

```powershell
curl.exe https://little-something-api.onrender.com/api/health
# {"status":"ok","timestamp":"..."}
```
✅ Gate: health returns 200, and Neon's **Tables** view shows `users`, `creations`,
`public_links`, `link_views`, `payments`, `files`.

Note the real service URL — if it isn't `little-something-api.onrender.com`, Step 2.5 uses
the actual one.

### Step 2.5 🔧 Feed the real API URL back into the frontend config
Update `API_BASE_URL` in `apps/web/wrangler.toml` (both blocks) and the fallback in
`functions/[[path]].js`, then commit + push. This must land **before** the Pages project is
created so the first Pages build already has the right origin.

---

## Phase 3 — Frontend on Cloudflare Pages

### Step 3.1 🧑 Create the Cloudflare account
dash.cloudflare.com → sign up → verify email. No domain needs to be added.

### Step 3.2 🧑 Create the Pages project
**Workers & Pages → Create → Pages → Connect to Git** → select the repo → configure:

| Setting | Value |
|---|---|
| Project name | `little-something-web` (must match `name` in `wrangler.toml`) |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm install && npm run build` |
| Build output directory | `dist` |
| **Root directory** | `apps/web` ← critical, this is how `functions/` is found |

No environment variables are needed in the dashboard: `API_BASE_URL` comes from
`wrangler.toml`, and the `VITE_*` build vars stay unset on purpose (same-origin mode).

### Step 3.3 ✅ First build
Build log should show vite emitting 13 HTML entries and
`Compiled Worker successfully` / `Uploading Functions bundle` — if the Functions line is
missing, the root directory is wrong and every `/s/<slug>` link will 404.

### Step 3.4 🧑 Point the API back at the real Pages URL
Copy the assigned URL (e.g. `https://little-something-web.pages.dev`) and in Render →
Environment set:
- `WEB_BASE_URL` = `https://little-something-web.pages.dev` (no trailing slash — share links
  are built from this)
- `ALLOWED_ORIGINS` = `https://little-something-web.pages.dev,http://localhost:5173,http://localhost:3001`

Save → Render redeploys (~1 min).

### Step 3.5 ✅ End-to-end smoke test (no payments/media yet)
1. `https://little-something-web.pages.dev/` → marketing page renders with styles.
2. `.../api/health` → `{"status":"ok"}` — **this proves the Function proxy works**.
3. `/templates.html` → template cards load (proxied `/api/templates`).
4. `/builder.html` → sign up with a real email → account created (proves Neon writes +
   the rate-limiter fix).
5. `/admin.html` → log in with the seeded admin → dashboard loads.

⚠️ Expect the *first* request after idle to take ~50 s: Render free sleeps after 15 min and
Neon free auto-suspends. This is the tradeoff we accepted; Phase 7 lists the fix.

---

## Phase 4 — Media storage (Cloudflare R2)

Required before real customers: Render's free disk is **ephemeral**, so the `/uploads`
fallback loses every uploaded photo/song on each restart (~daily). With R2 the browser PUTs
straight to R2 via presigned URLs and Render never touches the bytes.

### Step 4.1 🧑 Create the bucket
Cloudflare → **R2 → Create bucket** → name `little-something-media`, location APAC or WNAM.
(R2 needs a card on file even on the free 10 GB tier.)

### Step 4.2 🧑 Enable public access
Bucket → **Settings → Public Development URL → Enable** → copy `https://pub-xxxx.r2.dev`.
Good enough for testing; Phase 7 swaps in `cdn.<yourdomain>` because `r2.dev` is
rate-limited and not meant for production traffic.

### Step 4.3 🧑 Create a scoped API token
R2 → **Manage API Tokens → Create** → *Object Read & Write*, scoped to this bucket only.
Save **Access Key ID**, **Secret Access Key**, and your **Account ID**.

### Step 4.4 🧑 Set the R2 vars on Render
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET=little-something-media`, `R2_PUBLIC_URL=https://pub-xxxx.r2.dev` → redeploy.

### Step 4.5 🧑 Configure R2 CORS
Bucket → Settings → CORS policy, using `infra/R2_CORS.md` with our real origin:

```json
[{"AllowedOrigins":["https://little-something-web.pages.dev"],
  "AllowedMethods":["PUT","GET","HEAD"],"AllowedHeaders":["*"],
  "ExposeHeaders":["ETag"],"MaxAgeSeconds":300}]
```
The presigned PUT goes browser→R2 **directly** (not through the proxy), so without this CORS
rule uploads fail even though everything else works.

### Step 4.6 ✅ Verify
In the builder, upload a photo. Network tab: `/api/upload/sign` → 200, `PUT` to
`*.r2.cloudflarestorage.com` → 200, `/api/upload/confirm` → 200, image renders from
`pub-xxxx.r2.dev`, and the object appears in the bucket. `files.storage` should read `r2`.

---

## Phase 5 — Payments (Razorpay test mode)

### Step 5.1 🧑 Account + test keys
razorpay.com → sign up → stay in **Test Mode** → Settings → API Keys → Generate.
Copy `rzp_test_...` key id + secret. (No KYC needed for test mode.)

### Step 5.2 🧑 Set on Render
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` → redeploy. The startup warning disappears.

### Step 5.3 🧑 Create the webhook
Razorpay → Settings → Webhooks → Add:
- URL: `https://little-something-api.onrender.com/api/payments/webhook`
  (pointed **straight at Render**, bypassing the proxy — fewer hops for HMAC-signed raw bodies)
- Secret: generate a random string, save it as `RAZORPAY_WEBHOOK_SECRET` on Render
- Events: `payment.captured`, `payment.failed`, `order.paid` — exactly what
  `payments.js` handles.

### Step 5.4 ✅ Full purchase test
Build a surprise → Pay ₹99 with test card `4111 1111 1111 1111`, any future expiry, CVV
`123`, OTP `1111` → redirected to `/success.html?slug=...` → open `/s/<slug>` in a private
window: the surprise page renders with your photo and music.

Also verify: `payments` row `status=paid`, a `public_links` row with a 7-day expiry, a
`link_views` row with your **real IP** (not a Cloudflare IP — confirms Step 0.3), and the log
line `SMTP not configured — skipping payment confirmation email` (expected until Phase 6).

### Step 5.5 🧑 Going live (later, needs KYC)
Complete Razorpay KYC → generate live keys → swap the three Razorpay vars → re-create the
webhook in Live mode. Your `terms.html`, `privacy.html`, `refund.html`, `contact.html` pages
must be publicly reachable for activation — that's why they were added in Phase 0.

---

## Phase 6 — Confirmation email (optional)

### Step 6.1 🧑 Pick an SMTP provider
Brevo free (300/day) or Resend free (3 000/mo). Gmail app passwords work but land in spam.

### Step 6.2 🧑 Set on Render
`SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASSWORD`,
`EMAIL_FROM="LittleSomething <hello@yourdomain>"`.
Note: `apps/api/.env` is currently missing `SMTP_PORT` — I'll add it to the local file for
parity, since `email.js` silently disables itself when it's absent.

### Step 6.3 ✅ Verify
Make another test purchase → confirmation email arrives with the `/s/<slug>` link →
`payments.email_sent = true` (the idempotency flag that stops `/verify` and the webhook from
double-sending).

---

## Phase 7 — Post-launch hardening (documented, not executed now)

Ordered by impact:

1. **Cold starts** — Render free sleeps after 15 min idle; a WhatsApp recipient may wait ~50 s
   on a link they were excited about. Upgrade to Starter ($7/mo) before you promote the site.
   A cron pinger only masks it and burns your 750 free hours.
2. **Custom domain** — Pages → Custom domains (`littlesomething.app`); Render → Custom domain
   (`api.littlesomething.app`, CNAME, **DNS-only/grey cloud**); R2 → custom domain
   (`cdn.littlesomething.app`). Then update `WEB_BASE_URL`, `ALLOWED_ORIGINS`,
   `R2_PUBLIC_URL`, `API_BASE_URL` in `wrangler.toml`, and the R2 CORS origins.
   Existing `/s/` links keep working because they're stored as slugs, not absolute URLs.
3. **Neon backups** — free tier keeps a 6-hour restore window; schedule a `pg_dump` if
   customer data starts mattering.
4. **`multer@1.x`** is deprecated/EOL with known advisories → plan a bump to 2.x.
5. **Uptime monitoring** on `/api/health` (BetterStack free) so you learn about outages
   before a customer does.
6. **Razorpay live-mode audit** — verify the webhook fires in live mode and that refunds match
   the policy in `refund.html`.

---

## Rollback

- **Frontend**: Pages → Deployments → *Rollback* to the previous build (instant).
- **Backend**: Render → Events → *Rollback* to the prior deploy, or revert the commit and push.
- **Database**: Neon → Branches → *Restore* (6-hour window on free). `db.init()` migrations
  are additive-only, so a rollback of code does not break an already-migrated schema.

## Files this plan touches

| File | Change |
|---|---|
| `apps/api/render.yaml` | root-level workspace install, free plan, Neon vars, no Render DB |
| `apps/api/src/lib/database.js` | conditional TLS for Neon |
| `apps/api/index.js` | `app.set("trust proxy", true)` |
| `apps/api/src/routes/auth.js` | rate-limit keyed on real client IP |
| `apps/web/package.json` | drop unused `@little-something/shared` dep |
| `apps/web/wrangler.toml` | `[vars] API_BASE_URL`, drop legacy `type` |
| `apps/web/functions/[[path]].js` | safe fallback origin |
| `apps/web/.node-version` | new — pin Node 22 for Pages builds |
| `apps/api/.env` | local-only: Neon URL, `DATABASE_SSL`, `SMTP_PORT` (never committed) |

Total: 8 committed files, ~40 lines changed. No feature/behaviour changes to the product.
