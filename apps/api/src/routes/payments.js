const express = require("express");
const crypto = require("crypto");
const { razorpay, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = require("../lib/razorpay");
const { db } = require("../lib/database");
const { generateId } = require("../lib/auth");
const { authMiddleware } = require("../middleware/auth");
const { generateLinkForCreation } = require("./links");

const router = express.Router();
const webhookRouter = express.Router();

router.use(authMiddleware);

function getPaymentAmount() {
  return parseInt(process.env.PAYMENT_AMOUNT || "9900", 10);
}

function getPaymentCurrency() {
  return process.env.PAYMENT_CURRENCY || "INR";
}

function getLinkExpiryDays() {
  return parseInt(process.env.PRIVATE_LINK_EXPIRY_DAYS || "7", 10);
}

// Amounts are stored as integer paise (see M3). Convert to a display value.
function formatAmount(paise, currency) {
  const amount = Number(paise || 0) / 100;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
    }).format(amount);
  } catch (e) {
    return currency + " " + amount.toFixed(2);
  }
}

// Public base URL for surprise links. Prefer the configured web frontend origin
// (which proxies /s/* to this API) so shared links live on the branded domain.
function publicBaseUrl(req) {
  const webBase = process.env.WEB_BASE_URL;
  if (webBase) return webBase.replace(/\/$/, "");
  return (req.protocol || "https") + "://" + req.get("host");
}

function verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
  const hmac = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET);
  const generated = hmac.update(razorpayOrderId + "|" + razorpayPaymentId).digest("hex");
  return generated === razorpaySignature;
}

// Razorpay signs webhooks with the dedicated webhook secret (NOT the key
// secret). Fall back to the key secret only if no webhook secret is configured.
function verifyWebhookSignature(body, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const hmac = crypto.createHmac("sha256", secret);
  const generated = hmac.update(body).digest("hex");
  return generated === signature;
}

// M4: guarantee a single confirmation email per payment even if both /verify
// and the Razorpay webhook succeed. Uses an idempotent email_sent flag.
async function sendConfirmationIfNeeded(paymentId, email, amount, currency, linkUrl, expiresAt) {
  const payment = await db.prepare("SELECT email_sent FROM payments WHERE id = $1").get(paymentId);
  if (!payment) return;
  if (payment.email_sent) return;

  const { sendPaymentConfirmation } = require("../lib/email");
  await sendPaymentConfirmation(email, formatAmount(amount, currency), linkUrl, expiresAt);

  await db.prepare("UPDATE payments SET email_sent = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1").run(paymentId);
}

router.post("/create-order", async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(503).json({ error: "Payment service is not configured" });
    }
    const { creation_id } = req.body;
    if (!creation_id) {
      return res.status(400).json({ error: "creation_id is required" });
    }

    const creation = await db.prepare("SELECT * FROM creations WHERE id = $1 AND user_id = $2").get(creation_id, req.user.id);
    if (!creation) {
      return res.status(404).json({ error: "Creation not found" });
    }

    const existingPaid = await db.prepare(
      "SELECT * FROM payments WHERE creation_id = $1 AND status = 'paid' ORDER BY created_at DESC LIMIT 1"
    ).get(creation_id);

    if (existingPaid) {
      const existingLink = await db.prepare(
        "SELECT * FROM public_links WHERE creation_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1"
      ).get(creation_id, req.user.id);

      if (existingLink) {
        return res.status(200).json({
          already_paid: true,
          link: existingLink,
        });
      }
    }

    const order = await razorpay.orders.create({
      amount: getPaymentAmount(),
      currency: getPaymentCurrency(),
      receipt: generateId(),
      payment_capture: 1,
    });

    const payment = {
      id: generateId(),
      user_id: req.user.id,
      creation_id: creation_id,
      // M3: store as integer paise.
      amount: order.amount,
      currency: order.currency,
      status: "created",
      razorpay_order_id: order.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.prepare(
      "INSERT INTO payments (id, user_id, creation_id, amount, currency, status, razorpay_order_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"
    ).run(
      payment.id,
      payment.user_id,
      payment.creation_id,
      payment.amount,
      payment.currency,
      payment.status,
      payment.razorpay_order_id,
      payment.created_at,
      payment.updated_at
    );

    res.status(200).json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: RAZORPAY_KEY_ID,
      receipt: order.receipt,
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: "Failed to create payment order" });
  }
});

router.post("/verify", async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(503).json({ error: "Payment service is not configured" });
    }
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification fields" });
    }

    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    const payment = await db.prepare("SELECT * FROM payments WHERE razorpay_order_id = $1").get(razorpay_order_id);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    if (payment.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (payment.status === "paid") {
      const existingLink = await db.prepare(
        "SELECT * FROM public_links WHERE creation_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1"
      ).get(payment.creation_id, req.user.id);

      if (existingLink) {
        return res.status(200).json({
          success: true,
          link: existingLink,
        });
      }
    }

    await db.prepare(
      "UPDATE payments SET status = 'paid', razorpay_payment_id = $1, razorpay_signature = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3"
    ).run(razorpay_payment_id, razorpay_signature, payment.id);

    const creation = await db.prepare("SELECT * FROM creations WHERE id = $1").get(payment.creation_id);
    if (!creation) {
      return res.status(404).json({ error: "Creation not found" });
    }

    const linkResult = await generateLinkForCreation(payment.creation_id, payment.user_id, getLinkExpiryDays());
    const link = linkResult.link;

    const publicUrl = publicBaseUrl(req) + "/s/" + link.slug;

    const { sendPaymentConfirmation } = require("../lib/email");
    await sendConfirmationIfNeeded(payment.id, req.user.email, payment.amount, payment.currency, publicUrl, link.expires_at);

    res.status(200).json({
      success: true,
      link: link,
    });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

webhookRouter.post("/", async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(503).send("Payment service is not configured");
    }
    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
      return res.status(400).send("Missing signature");
    }

    // C1: req.body is a raw Buffer here because the raw parser is mounted before
    // express.json() in index.js. Guard against an empty body.
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).send("Empty body");
    }

    const body = req.body.toString("utf8");
    const isValid = verifyWebhookSignature(body, signature);
    if (!isValid) {
      return res.status(400).send("Invalid signature");
    }

    const event = JSON.parse(body);
    const eventType = event.event || "";
    const payload = event.payload && event.payload.payment && event.payload.payment.entity ? event.payload.payment.entity : null;

    if (!payload) {
      return res.status(200).send("No payment entity");
    }

    const orderId = payload.order_id;
    const paymentId = payload.id;

    const payment = await db.prepare("SELECT * FROM payments WHERE razorpay_order_id = $1").get(orderId);
    if (!payment) {
      return res.status(200).send("Payment not found");
    }

    if (payment.status === "paid" && payment.razorpay_payment_id === paymentId) {
      return res.status(200).send("Already processed");
    }

    let newStatus = payment.status;
    if (eventType === "payment.captured" || eventType === "order.paid") {
      newStatus = "paid";
    } else if (eventType === "payment.failed") {
      newStatus = "failed";
    }

    await db.prepare(
      "UPDATE payments SET status = $1, razorpay_payment_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3"
    ).run(newStatus, paymentId, payment.id);

    if (newStatus === "paid") {
      const creation = await db.prepare("SELECT * FROM creations WHERE id = $1").get(payment.creation_id);
      if (creation) {
        const existingLink = await db.prepare(
          "SELECT * FROM public_links WHERE creation_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1"
        ).get(payment.creation_id, payment.user_id);

        let link;
        if (existingLink && new Date(existingLink.expires_at) > new Date()) {
          link = existingLink;
        } else {
          var linkResult = await generateLinkForCreation(payment.creation_id, payment.user_id, getLinkExpiryDays());
          link = linkResult.link;
        }

        const publicUrl = publicBaseUrl(req) + "/s/" + link.slug;
        const user = await db.prepare("SELECT email FROM users WHERE id = $1").get(payment.user_id);
        if (user) {
          await sendConfirmationIfNeeded(payment.id, user.email, payment.amount, payment.currency, publicUrl, link.expires_at);
        }
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).send("Webhook error");
  }
});

module.exports = { router, webhookRouter };
