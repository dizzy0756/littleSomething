# Razorpay Integration Plan — Little Something Builder

## 1. Project Understanding Summary

The project is a vanilla JS website builder with:
- **Backend**: Express.js + PostgreSQL (`pg`), flat route structure in `server/src/routes/`
- **Frontend**: Static HTML/CSS/JS served by Express, no build step
- **Auth**: JWT Bearer tokens, bcrypt passwords
- **Database**: PostgreSQL via `pg` connection pool, `DATABASE_URL` env var
- **Builder**: `builder.html` + `builder.js` — user customizes template, then clicks "Generate Link"
- **Current "Generate Link" flow** (builder.js:753-819): saves creation → generates public link → copies URL → opens in new tab. **No payment gating.**
- **Checkout**: `checkout.html` is a mock with no JS logic
- **Payments**: `payments` table exists but only used in admin stats (`status = 'succeeded'`), has Stripe-specific `stripe_payment_intent_id`
- **No email system exists**
- **No webhook system exists**

## 2. Files to Create

| File | Purpose |
|------|---------|
| `server/src/routes/payments.js` | Payment API: create-order, verify, webhook |
| `server/src/lib/email.js` | Nodemailer SMTP email service |
| `server/src/lib/razorpay.js` | Razorpay client initialization |
| `success.html` | Payment success page (replaces mock checkout success) |
| `payment-failed.html` | Payment failed/cancelled page |
| `docs/RAZORPAY_SETUP.md` | Setup and deployment documentation |

## 3. Files to Modify

| File | Changes |
|------|---------|
| `server/package.json` | Add `razorpay`, `nodemailer` dependencies |
| `server/.env.example` | Add Razorpay, SMTP, payment config env vars |
| `server/index.js` | Mount `/api/payments` routes; add raw body parser for webhook |
| `server/src/lib/database.js` | Migrate `payments` table schema; add migration runner |
| `server/src/routes/admin.js` | Update payment stats queries for new status values |
| `server/.gitignore` | Ensure `.env` is ignored |
| `builder.js` | Replace "Generate Link" with payment-gated flow |
| `checkout.html` | Replace mock with actual checkout flow (or repurpose) |
| `index.html` | Update pricing CTA to go through payment flow |

## 4. Database Migration

### Current `payments` table:
```sql
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  amount REAL,
  currency TEXT DEFAULT 'usd',
  status TEXT DEFAULT 'pending',
  stripe_payment_intent_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)
```

### New `payments` table (safe migration):
```sql
-- Keep existing columns
-- Add new columns
ALTER TABLE payments ADD COLUMN creation_id TEXT;
ALTER TABLE payments ADD COLUMN razorpay_order_id TEXT;
ALTER TABLE payments ADD COLUMN razorpay_payment_id TEXT;
ALTER TABLE payments ADD COLUMN razorpay_signature TEXT;
ALTER TABLE payments ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
-- Drop old Stripe column if it exists
-- (SQLite doesn't support DROP COLUMN in older versions, so we'll just stop using it)
```

**Migration approach**: Add a lightweight `runMigrations()` function in `database.js` that checks column existence via `PRAGMA table_info(payments)` and applies ALTER TABLE statements idempotently.

**Important**: The existing `payments` table may have stale Stripe data. Admin stats currently filter `status = 'succeeded'`. After migration, successful Razorpay payments will use `status = 'paid'`. I'll update admin queries to count both `succeeded` (legacy) and `paid` (new).

## 5. Environment Variables

### Add to `.env.example` and `.env`:
```env
# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# Payment config
PAYMENT_AMOUNT=9900
PAYMENT_CURRENCY=INR
PRIVATE_LINK_EXPIRY_DAYS=7

# Email (Nodemailer SMTP)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=
```

**Never expose to frontend**: `RAZORPAY_KEY_SECRET`, `SMTP_PASSWORD`

## 6. New API Endpoints

### `POST /api/payments/create-order`
- **Auth**: Required
- **Body**: `{ creation_id: string }`
- **Logic**:
  1. Authenticate user
  2. Verify creation exists and belongs to user
  3. Check if payment already exists for this creation with status `paid`
  4. Create Razorpay order for ₹99 (9900 paise), INR
  5. Save payment record with `status = 'created'`, `razorpay_order_id`
  6. Return `{ order_id, amount, currency, key_id }` (no secret!)
- **Response**: `200 { order_id, amount, currency, key_id, receipt }`

### `POST /api/payments/verify`
- **Auth**: Required
- **Body**: `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`
- **Logic**:
  1. Authenticate user
  2. Find payment by `razorpay_order_id`
  3. Verify payment belongs to user
  4. Verify Razorpay signature (`razorpay_order_id + "|" + razorpay_payment_id` → HMAC-SHA256 with key secret)
  5. If already `paid`, return existing result (idempotency)
  6. Update payment: `status = 'paid'`, store `razorpay_payment_id`, `razorpay_signature`
  7. Create/finalize creation (ensure it exists)
  8. Generate private link (7-day expiry, random slug)
  9. Send confirmation email (async, non-blocking)
  10. Return `{ success: true, link: { slug, url, expires_at } }`
- **Response**: `200 { success: true, link: {...} }`

### `POST /api/payments/webhook`
- **Auth**: Razorpay signature verification via `X-Razorpay-Signature`
- **Body**: Raw JSON (requires `express.raw({ type: 'application/json' })` middleware)
- **Events handled**: `payment.captured`, `payment.failed`, `order.paid`
- **Logic**:
  1. Verify webhook signature
  2. Find payment by `razorpay_order_id` from event payload
  3. Idempotency: if already processed, return 200
  4. Update payment status based on event
  5. If `payment.captured` or `order.paid` and not yet finalized:
     - Finalize creation
     - Generate link
     - Send email
  6. Return 200

## 7. Frontend Changes

### `builder.js` — Payment-Gated Flow

**Current flow** (`bindGenerateLink`):
1. Save creation (POST /api/creations or PUT)
2. Generate link (POST /api/links/:id/generate)
3. Copy URL, open in new tab

**New flow**:
1. Save creation (same as before)
2. Redirect to `/checkout.html?creation_id=xxx` (or open checkout in new window)
3. Checkout page calls `/api/payments/create-order`
4. Opens Razorpay Checkout with UPI enabled
5. On success, calls `/api/payments/verify`
6. On verification success, redirects to `/success.html?slug=xxx`
7. On failure/cancel, shows retry option

**Alternative (simpler, stays in builder)**: 
- On "Generate Link" click, save creation, then call `/api/payments/create-order`
- Open Razorpay Checkout modal in the builder page
- On verify success, generate link and show success UI
- This keeps the user in the builder context

I'll go with the **alternative** since it avoids needing to pass state between pages and keeps the flow cohesive. The builder will handle the Razorpay Checkout modal.

### `checkout.html` — Repurpose as Success/Failed Page
- Convert from mock to a proper result page
- Reads `slug` from URL params to show success, or shows failure/cancelled state
- Or simply delete it and use `success.html` + `payment-failed.html`

I'll create `success.html` and `payment-failed.html`, and update `checkout.html` minimally or repurpose it.

## 8. Email Service

**File**: `server/src/lib/email.js`

- Uses Nodemailer with SMTP
- Reads config from env vars
- `sendPaymentConfirmation(userEmail, amount, linkUrl, expiresAt)` function
- Called after payment verification succeeds
- Failures are logged but do not fail the payment

## 9. Private Link Logic

Reuse existing `/api/links/:creationId/generate` logic, but:
- After payment verification, call the existing link generation
- Or create the link directly in the verify handler (same logic)
- Slug generation: `crypto.randomBytes(7).toString("base64url").slice(0, 10)` — already used in `links.js`
- Expiry: `PRIVATE_LINK_EXPIRY_DAYS` from env (default 7)

**Important**: Do NOT allow link generation without payment. The verify handler should be the only path to link generation for paid creations.

## 10. Idempotency / Duplicate Prevention

- **create-order**: Check if a `paid` payment already exists for this creation; if so, return existing link
- **verify**: Check if payment is already `paid`; if so, return existing link instead of creating new one
- **webhook**: Check if event already processed (by `razorpay_payment_id`); if so, return 200
- Use DB unique constraints: `razorpay_order_id` should ideally be unique, but since SQLite has limited ALTER TABLE support, we'll enforce uniqueness in application logic
- Actually, we can add a unique index: `CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_razorpay_order ON payments(razorpay_order_id)` — but only for non-null values

## 11. Security Considerations

1. **Amount**: Backend controls `PAYMENT_AMOUNT=9900`; never trust frontend amount
2. **Signature**: Always verify Razorpay signatures server-side
3. **Auth**: All payment endpoints require authenticated user
4. **Authorization**: User can only pay for their own creations
5. **Secrets**: Never return `RAZORPAY_KEY_SECRET` to frontend; only `RAZORPAY_KEY_ID`
6. **Webhook**: Verify `X-Razorpay-Signature` header
7. **Slugs**: Cryptographically random via `crypto.randomBytes`
8. **Parameterized queries**: All DB queries use `?` placeholders (already project convention)
9. **Input validation**: Validate all request bodies

## 12. Razorpay SDK Usage

```js
const Razorpay = require('razorpay');
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create order
const order = await razorpay.orders.create({
  amount: PAYMENT_AMOUNT, // 9900
  currency: PAYMENT_CURRENCY, // 'INR'
  receipt: paymentId, // our internal payment id
  payment_capture: 1, // auto-capture
});

// Verify signature
const crypto = require('crypto');
const hmac = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET);
const generatedSignature = hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
const isValid = generatedSignature === razorpay_signature;
```

## 13. Testing Plan

- **Successful payment**: Use Razorpay test mode with test cards/UPI
- **Failed payment**: Test card that fails
- **Cancelled checkout**: Close Razorpay modal without paying
- **Duplicate verification**: Send same verify request twice → only one website/link
- **Duplicate webhook**: Send same webhook twice → no duplicates
- **Expired link**: Verify 410 response after 7 days
- **Unauthorized access**: User A cannot pay for User B's creation

## 14. Implementation Order

1. **Database migration** — update `database.js` with new payments schema + migration runner
2. **Backend routes** — create `payments.js` with create-order, verify, webhook
3. **Razorpay init** — create `razorpay.js` helper
4. **Email service** — create `email.js`
5. **Mount routes** — update `index.js`
6. **Frontend payment flow** — update `builder.js` with Razorpay Checkout integration
7. **Success/failure pages** — create `success.html` and `payment-failed.html`
8. **Admin stats** — update `admin.js` for new payment statuses
9. **Documentation** — create `docs/RAZORPAY_SETUP.md`
10. **Testing** — verify all flows in Razorpay test mode

## 15. Assumptions

1. The existing `payments` table may contain stale Stripe-oriented test data; migration preserves it but new payments use the new schema
2. `checkout.html` will be repurposed; current mock content is replaced
3. The builder's "Generate Link" button is renamed to "Pay ₹99 & Generate Link" and triggers the payment flow
4. Razorpay Test Mode uses test credentials; no live keys are needed for development
5. Email is optional (SMTP config may be absent); email failures are logged but don't fail payments
6. The project uses CommonJS (`require`), not ESM
7. All existing routes, templates, and functionality remain unchanged except where directly tied to payments
