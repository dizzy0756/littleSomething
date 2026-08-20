// One-off recovery for a payment that was captured by Razorpay but whose
// /api/payments/verify (and webhook) never completed, leaving the row at
// status='created' with no link. This marks the confirmed payment as paid and
// generates the public link. Run dry (no args) to inspect; run with APPLY=1 to
// actually mutate.
//
// Usage:
//   node scripts/recover-payment.js                 # dry run, prints target
//   APPLY=1 node scripts/recover-payment.js          # mutate with placeholder payment id
//   APPLY=1 PAYMENT_ID=pay_xxx node scripts/recover-payment.js  # use real id

const path = require("path");
require("dotenv").config({ path: path.resolve("apps/api/.env") });

const { db } = require("../apps/api/src/lib/database");
const { generateLinkForCreation } = require("../apps/api/src/routes/links");

const PAYMENT_ID = process.env.PAYMENT_ID || null;
const APPLY = process.env.APPLY === "1";

function publicBaseUrl() {
  const webBase = process.env.WEB_BASE_URL;
  if (webBase) return webBase.replace(/\/$/, "");
  return "https://little-something-web.pages.dev";
}

async function main() {
  const stuck = await db
    .prepare("SELECT * FROM payments WHERE status = 'created' ORDER BY created_at DESC LIMIT 1")
    .get();

  if (!stuck) {
    console.log("No payment with status='created' found. Nothing to recover.");
    return;
  }

  console.log("Stuck payment:");
  console.log("  id            :", stuck.id);
  console.log("  creation_id   :", stuck.creation_id);
  console.log("  user_id       :", stuck.user_id);
  console.log("  razorpay_order:", stuck.razorpay_order_id);
  console.log("  amount        :", stuck.amount, stuck.currency);

  const existing = await db
    .prepare("SELECT * FROM public_links WHERE creation_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1")
    .get(stuck.creation_id, stuck.user_id);

  if (existing && new Date(existing.expires_at) > new Date()) {
    console.log("\nA valid link already exists:");
    console.log("  ", publicBaseUrl() + "/s/" + existing.slug);
    return;
  }

  if (!APPLY) {
    console.log("\n[DRY RUN] Would mark paid and generate link. Re-run with APPLY=1 to apply.");
    return;
  }

  const paymentId = PAYMENT_ID || "recovered-" + stuck.razorpay_order_id;
  await db
    .prepare(
      "UPDATE payments SET status = 'paid', razorpay_payment_id = $1, razorpay_signature = 'recovered', updated_at = CURRENT_TIMESTAMP WHERE id = $2"
    )
    .run(paymentId, stuck.id);

  const { link } = await generateLinkForCreation(
    stuck.creation_id,
    stuck.user_id,
    parseInt(process.env.PRIVATE_LINK_EXPIRY_DAYS || "7", 10)
  );

  console.log("\n[APPLIED] Payment marked paid and link generated:");
  console.log("  ", publicBaseUrl() + "/s/" + link.slug);
  console.log("  expires_at:", link.expires_at);
  if (!PAYMENT_ID) {
    console.log("\nNote: razorpay_payment_id was set to a placeholder. To record the real id,");
    console.log("      re-run with PAYMENT_ID=<real pay_...> (idempotent — link is kept).");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Recovery failed:", err);
    process.exit(1);
  });
