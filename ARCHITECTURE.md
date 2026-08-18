# Architecture — Little Something For You (Split Deployment)

Target topology:
- **Frontend** → Cloudflare (Pages + optional Pages Functions, edge)
- **Backend API** → Render (Node/Express, long-running)
- **Database** → PostgreSQL (Render Postgres / Supabase / Neon)
- **Media** → Cloudflare R2 (S3-compatible object storage, same provider as the edge → no egress fees)
- **Payments** → Razorpay (test mode now, live URL after deployment)

> Why R2 for media instead of Render disk or Postgres blobs: Render's filesystem is
> **ephemeral** (wiped on every deploy / scale), and Postgres is terrible at large
> binary blobs. The current `server/uploads/` approach will lose every uploaded
> photo/song/gif on the next deploy. R2 is S3-compatible, cheap, and fronted by
> Cloudflare's CDN — perfect for serving media globally from the same edge.

---

## 1. Recommended Directory Structure — Monorepo with Workspaces

A **single git repo, two deployable apps** (`apps/web` → Cloudflare, `apps/api` → Render).
Keeps shared types/schemas in one place and lets one PR ship both sides.

```
little-something-builder/            # npm workspaces monorepo
├── apps/
│   ├── web/                      # Cloudflare Pages frontend (Vite build → dist/)
│   │   ├── public/               # static assets served at root (/assets, /templates)
│   │   │   ├── assets/           # gifs, demo photo/song
│   │   │   └── templates/       # template.js + template.css (copied from api for preview)
│   │   ├── src/
│   │   │   └── config.js         # Vite `define`-injected env: API_BASE, RAZORPAY_KEY_ID, uploadFile()
│   │   ├── *.html,*.css,*.js     # builder, admin, index, checkout, preview, success, etc.
│   │   ├── vite.config.js        # multi-page build + dev proxy to the API
│   │   ├── wrangler.toml         # Cloudflare Pages project (pages_build_output_dir = dist)
│   │   ├── .env.example          # VITE_* public build vars
│   │   └── package.json
│   │
│   └── api/                      # Render backend (Express, Node)
│       ├── index.js              # bootstrap: helmet, CORS allowlist, routes, /s, /api/health
│       ├── src/
│       │   ├── routes/           # auth, creations, upload, links, payments, site, admin, ...
│       │   ├── lib/
│       │   │   ├── database.js    # pg Pool + self-healing migrations (adds `storage` col)
│       │   │   ├── r2.js          # @aws-sdk/client-s3 presigned PUT + public URL resolver
│       │   │   ├── files.js       # file row → DTO with resolved URL
│       │   │   ├── razorpay.js    # order create + webhook verify
│       │   │   ├── auth.js        # JWT sign/verify
│       │   │   └── email.js       # nodemailer
│       │   ├── middleware/        # auth (Bearer + cookie), upload (multer, local fallback)
│       │   └── templates/        # template.js + template.css served at /templates for /s pages
│       ├── render.yaml           # Render Blueprint: web service + Postgres + env
│       ├── .env.example
│       └── package.json
│
├── packages/
│   └── shared/                  # @little-something/shared — zod schemas + constants
│       ├── src/index.js          # media limits, MEDIA_KINDS, validateBody, checkMedia
│       └── package.json
│
├── infra/
│   ├── db/schema.sql            # canonical DDL (users, creations, files, links, payments)
│   └── R2_CORS.md               # R2 bucket CORS policy for direct browser PUTs
│
├── .env.example                 # root reference of every var (no secrets)
├── .gitignore
├── package.json                 # workspaces: apps/*, packages/*
└── ARCHITECTURE.md
```

**Decoupling rationale:** Cloudflare builds a *static* bundle (no server runtime beyond
optional Pages Functions); Render runs the *only* stateful service (API + DB access +
Razorpay secrets). They share `packages/shared` for type safety but deploy independently.

---

## 2. High-Level Data Flow (Secure)

```
┌──────────────┐      HTTPS (CORS)       ┌──────────────────────┐
│  Browser     │ ──────────────────────▶│  Cloudflare Edge     │
│ (apps/web)   │ ◀──────────────────────│ (static + Functions) │
└──────────────┘   static assets + CDN   └──────────┬───────────┘
                                                    │ API calls
                                                    ▼
                                         ┌──────────────────────┐
                                         │  Render API (Express) │
                                         │  - JWT auth           │
                                         │  - CORS allowlist     │
                                         │  - rate limit         │
                                         └───┬───────────┬──────┘
                              queries        │           │ presigned PUT / verify
                                             ▼           ▼
                                     ┌────────────┐  ┌────────────┐
                                     │ PostgreSQL │  │  Cloudflare│
                                     │ (profiles, │  │  R2 (media)│
                                     │  projects, │  └────────────┘
                                     │  media refs│
                                     │  payments) │
                                     └─────┬──────┘
                                           │ webhook (sig-verified)
                                           ▼
                                     ┌────────────┐
                                     │  Razorpay  │◀── checkout (client-side)
                                     └────────────┘
```

### Request paths
1. **Page load** — Browser fetches static HTML/JS/CSS from Cloudflare edge (cached). No API hit needed for public showcase sites.
2. **Authenticated action** (build/save/export) — `web` calls `api` at `VITE_API_BASE_URL` with `Authorization: Bearer <JWT>`. API validates JWT, queries Postgres, returns JSON.
3. **Media upload** — Client requests a **presigned PUT URL** from the API (`POST /upload/sign`). API validates ownership + size/type limits, returns a short-lived R2 URL. Client uploads **directly to R2** (bypasses Render entirely → no bandwidth/temp-disk cost). API stores only the `storage_key` + metadata in Postgres.
4. **Media delivery** — Cloudflare serves R2 objects via its CDN (public bucket or signed URLs). The DB holds the key; the frontend builds the URL.
5. **Payment** — `web` calls `POST /payments/order` → API creates a Razorpay order (server-side, key secret never leaves Render) → client opens Razorpay Checkout → user pays → Razorpay calls `POST /payments/webhook` on the API. API **verifies the `X-Razorpay-Signature` HMAC** before marking the order paid, activating the private link, and emailing the customer.

### Security boundaries
- All cross-service traffic is **HTTPS only**.
- API never trusts the client for payment state — only the **webhook signature** flips an order to `paid`.
- Secrets (JWT_SECRET, RAZORPAY_KEY_SECRET, DATABASE_URL) live **only** in Render's env / Cloudflare secrets — never in the repo or client bundle.
- Public frontend bundle contains **zero** secrets — only the public `RAZORPAY_KEY_ID` (safe to expose) and the API base URL.

---

## 3. Environment Variables & CORS Best Practices

### Environment variables
Split by where they are needed and by sensitivity. Use a **`.env.example`** at root
(documentation only) and real values in each platform's dashboard.

**Cloudflare (`apps/web`) — build-time / public:**
| Var | Scope | Notes |
|-----|-------|-------|
| `VITE_API_BASE_URL` | public | e.g. `https://api.littlesomething.app`. Injected at build. |
| `VITE_RAZORPAY_KEY_ID` | public | Razorpay **publishable** key (safe in client). |
| `VITE_CDN_BASE_URL` | public | R2 public URL / Cloudflare domain for media. |

Set in: Cloudflare Pages → Settings → Environment variables (Production + Preview).
Never put secret values here — anything `VITE_` is shipped to the browser.

**Render (`apps/api`) — runtime / secret:**
| Var | Scope | Notes |
|-----|-------|-------|
| `DATABASE_URL` | secret | Use the **pooled** connection string Render/Supabase provides. |
| `JWT_SECRET` | secret | Long random; rotateable. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | secret | Start in test mode; swap to live keys post-deployment. |
| `RAZORPAY_WEBHOOK_SECRET` | secret | For signature verification. |
| `ALLOWED_ORIGINS` | config | Comma-list: `https://littlesomething.app,https://preview-...` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | secret | S3-compatible creds. |
| `SMTP_*` | secret | Email delivery. |

Manage via Render **Environment Groups** so staging/prod share structure but differ in values. Add a CI check that fails if a referenced var is missing.

### CORS (backend)
Use an explicit allowlist — **never** `Access-Control-Allow-Origin: *` with credentials.

```js
const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim());
app.use(cors({
  origin: (o, cb) => cb(null, allowed.includes(o) ? o : false), // reflect exact origin
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 600, // cache preflight 10 min
}));
```

- Reflect the exact matched origin (not `*`) so `Authorization` cookies/headers work.
- Preflight `OPTIONS` must return `204` fast — cache with `maxAge`.
- If you deploy a Cloudflare **Pages Function** as a BFF proxy, you can even same-origin the API and skip browser CORS entirely (proxy injects the API base server-side).

---

## 4. Large Media Handling (Photos / Music / GIFs)

**Rule: Postgres stores metadata + a storage key; R2 stores the bytes.** Never `BYTEA` blobs.

### PostgreSQL schema (refs only)
```sql
CREATE TABLE media (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES users(id),
  kind         TEXT NOT NULL CHECK (kind IN ('photo','music','gif')),
  storage_key  TEXT NOT NULL,          -- path in R2: "<ownerId>/<uuid>.jpg"
  mime         TEXT NOT NULL,
  bytes        BIGINT NOT NULL,
  width        INT, height INT,        -- photos/gifs
  duration_ms  INT,                    -- music/gifs
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES users(id),
  title        TEXT,
  config_json  JSONB NOT NULL,          -- builder config (text, colors, layout)
  cover_media_id UUID REFERENCES media(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payments (
  id           UUID PRIMARY KEY,
  order_id     TEXT UNIQUE NOT NULL,    -- Razorpay order id
  user_id      UUID REFERENCES users(id),
  amount       INT NOT NULL,            -- paise
  currency     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'created', -- created|paid|failed
  webhook_verified BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### Upload strategy (zero Render disk usage)
1. Client → `POST /upload/sign` with `{ kind, mime, bytes }`.
2. API validates: authenticated user, `bytes <= LIMIT` (photo 10 MB, music 25 MB, gif 8 MB), mime allowlist.
3. API returns a **presigned PUT URL** (TTL ~5 min) + the final `storage_key`.
4. Client `PUT`s the file **straight to R2**. Browser → Cloudflare → R2, never touching Render's disk.
5. Client → `POST /media` confirms; API writes the metadata row. (Or API writes it as part of sign + verifies existence.)

### Delivery strategy
- Make the R2 bucket **public** behind a Cloudflare domain (`cdn.littlesomething.app`) and let Cloudflare cache at the edge → global, fast, free egress.
- For private content, use **signed URLs** (15-min TTL) instead of public read.
- Optimize on upload: cap GIF dimensions, transcode music to a capped bitrate, strip EXIF from photos. Do this client-side or in a small Render worker — not in the request path.

### Why not Postgres blobs / Render disk
- Render disk is **ephemeral** → `server/uploads/` is lost on redeploy (current bug).
- `BYTEA`/TOAST blobs bloat backups, slow queries, and can't be CDN-cached.
- R2 + Cloudflare CDN gives geo-cached delivery at zero egress cost (same provider).

---

## 5. Razorpay — Live URL Integration Workflow

1. **Now (test):** set `RAZORPAY_KEY_ID`/`SECRET` to **test-mode** keys. Set `RAZORPAY_WEBHOOK_SECRET` from the Razorpay dashboard test webhook. Point the test webhook at `https://<api>.onrender.com/payments/webhook`.
2. **Build the flow:** order creation server-side, Checkout on the client, webhook verification server-side (HMAC-SHA256 over `razorpay_order_id|razorpay_payment_id` with the webhook secret). Only flip `status='paid'` after verification.
3. **Post-deployment (go live):**
   - In Razorpay dashboard → switch to **Live** mode, generate live keys, paste into Render env (`RAZORPAY_KEY_ID`/`SECRET`/`WEBHOOK_SECRET`).
   - Add the **production** webhook URL (`https://api.littlesomething.app/payments/webhook`) with the live secret.
   - Update `VITE_RAZORPAY_KEY_ID` in Cloudflare to the live publishable key and redeploy `apps/web`.
   - Keep test keys in a `staging` Render environment for QA. No code change required — only env values.

This env-only switch means the live URL integration is a config change, not a code change.

---

## 6. Migration Checklist from Current Repo
- [ ] Move flat HTML/CSS/JS into `apps/web/src` and add Vite + `wrangler.toml`.
- [ ] Move `server/` into `apps/api`; delete `server/uploads/` and `data/app.db` (SQLite).
- [ ] Add `packages/shared` with zod schemas; replace ad-hoc validation.
- [ ] Replace multer disk storage with R2 presigned-URL upload (`lib/r2.js`).
- [ ] Add `render.yaml` (web service + Postgres) and Cloudflare Pages project.
- [ ] Move env into platform dashboards; enforce CORS allowlist.
- [ ] Run `schema.sql` migration against the managed Postgres.
