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

function verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
  const hmac = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET);
  const generated = hmac.update(razorpayOrderId + "|" + razorpayPaymentId).digest("hex");
  return generated === razorpaySignature;
}

function verifyWebhookSignature(body, signature) {
  const hmac = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET);
  const generated = hmac.update(body).digest("hex");
  return generated === signature;
}

router.post("/create-order", async (req, res) => {
  try {
    const { creation_id } = req.body;
    if (!creation_id) {
      return res.status(400).json({ error: "creation_id is required" });
    }

    const creation = db.prepare("SELECT * FROM creations WHERE id = ? AND user_id = ?").get(creation_id, req.user.id);
    if (!creation) {
      return res.status(404).json({ error: "Creation not found" });
    }

    const existingPaid = db.prepare(
      "SELECT * FROM payments WHERE creation_id = ? AND status = 'paid' ORDER BY created_at DESC LIMIT 1"
    ).get(creation_id);

    if (existingPaid) {
      const existingLink = db.prepare(
        "SELECT * FROM public_links WHERE creation_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1"
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
      amount: order.amount / 100,
      currency: order.currency,
      status: "created",
      razorpay_order_id: order.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.prepare(
      "INSERT INTO payments (id, user_id, creation_id, amount, currency, status, razorpay_order_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification fields" });
    }

    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    const payment = db.prepare("SELECT * FROM payments WHERE razorpay_order_id = ?").get(razorpay_order_id);
    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    if (payment.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (payment.status === "paid") {
      const existingLink = db.prepare(
        "SELECT * FROM public_links WHERE creation_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1"
      ).get(payment.creation_id, req.user.id);

      if (existingLink) {
        return res.status(200).json({
          success: true,
          link: existingLink,
        });
      }
    }

    db.prepare(
      "UPDATE payments SET status = 'paid', razorpay_payment_id = ?, razorpay_signature = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(razorpay_payment_id, razorpay_signature, payment.id);

    const creation = db.prepare("SELECT * FROM creations WHERE id = ?").get(payment.creation_id);
    if (!creation) {
      return res.status(404).json({ error: "Creation not found" });
    }

    const linkResult = generateLinkForCreation(payment.creation_id, payment.user_id, getLinkExpiryDays());
    const link = linkResult.link;

    const publicUrl = (req.protocol + "://" + req.get("host")) + "/s/" + link.slug;

    const { sendPaymentConfirmation } = require("../lib/email");
    sendPaymentConfirmation(req.user.email, payment.amount, publicUrl, link.expires_at);

    res.status(200).json({
      success: true,
      link: link,
    });
  } catch (err) {
    console.error("Verify payment error:", err);
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

webhookRouter.post("/", (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
      return res.status(400).send("Missing signature");
    }

    const body = req.body.toString();
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

    const payment = db.prepare("SELECT * FROM payments WHERE razorpay_order_id = ?").get(orderId);
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

    db.prepare(
      "UPDATE payments SET status = ?, razorpay_payment_id = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newStatus, paymentId, payment.id);

    if (newStatus === "paid") {
      const creation = db.prepare("SELECT * FROM creations WHERE id = ?").get(payment.creation_id);
      if (creation) {
        const existingLink = db.prepare(
          "SELECT * FROM public_links WHERE creation_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1"
        ).get(payment.creation_id, payment.user_id);

        let link;
        if (existingLink && new Date(existingLink.expires_at) > new Date()) {
          link = existingLink;
        } else {
          var linkResult = generateLinkForCreation(payment.creation_id, payment.user_id, getLinkExpiryDays());
          link = linkResult.link;
        }

        const publicUrl = "https://" + req.get("host") + "/s/" + link.slug;
        const { sendPaymentConfirmation } = require("../lib/email");
        const user = db.prepare("SELECT email FROM users WHERE id = ?").get(payment.user_id);
        if (user) {
          sendPaymentConfirmation(user.email, payment.amount, publicUrl, link.expires_at);
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
