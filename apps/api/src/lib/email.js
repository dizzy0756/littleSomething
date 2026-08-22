const BREVO_API_KEY = process.env.BREVO_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

function parseFrom(raw) {
  if (!raw) return null;
  const m = raw.match(/^(?:"?([^"<]+?)"?\s*)?<(.+?)>\s*$/);
  if (m) return { name: (m[1] || "").trim(), email: m[2].trim() };
  return { name: "", email: raw.trim() };
}

const sender = parseFrom(EMAIL_FROM);

async function sendViaBrevo(payload) {
  if (!BREVO_API_KEY || !sender || !sender.email) {
    return false;
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("Brevo email send failed:", res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to send email via Brevo:", err);
    return false;
  }
}

async function sendPaymentConfirmation(userEmail, amount, linkUrl, expiresAt) {
  if (!BREVO_API_KEY || !sender || !sender.email) {
    console.warn("BREVO_API_KEY / EMAIL_FROM not configured — skipping payment confirmation email to", userEmail);
    return;
  }

  const subject = "Your LittleSomething surprise is ready ♥";
  const textContent =
    "Hi there!\n\n" +
    "Your LittleSomething has been created and is waiting to be shared.\n\n" +
    "Private link: " + linkUrl + "\n" +
    "This link will expire on " + new Date(expiresAt).toLocaleDateString() + ".\n\n" +
    "Made with ♥";
  const htmlContent =
    "<p>Hi there!</p>" +
    "<p>Your <strong>LittleSomething</strong> has been created and is waiting to be shared.</p>" +
    "<p><a href=\"" + linkUrl + "\">Open your surprise</a></p>" +
    "<p><small>This link will expire on " + new Date(expiresAt).toLocaleDateString() + ".</small></p>" +
    "<p>Made with ♥</p>";

  const ok = await sendViaBrevo({
    sender,
    to: [{ email: userEmail }],
    subject,
    textContent,
    htmlContent,
  });

  if (ok) console.log("Payment confirmation email sent to", userEmail);
}

async function sendPasswordReset(userEmail, resetUrl) {
  if (!BREVO_API_KEY || !sender || !sender.email) {
    console.warn("BREVO_API_KEY / EMAIL_FROM not configured — skipping password reset email to", userEmail);
    return false;
  }

  const subject = "Reset your LittleSomething password";
  const textContent =
    "Hi,\n\n" +
    "We received a request to reset your LittleSomething password.\n\n" +
    "Reset your password: " + resetUrl + "\n\n" +
    "This link expires in 1 hour. If you didn't request this, you can safely ignore this email.\n\n" +
    "Made with ♥";
  const htmlContent =
    "<p>Hi,</p>" +
    "<p>We received a request to reset your LittleSomething password.</p>" +
    "<p><a href=\"" + resetUrl + "\">Reset your password</a></p>" +
    "<p><small>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</small></p>" +
    "<p>Made with ♥</p>";

  const ok = await sendViaBrevo({
    sender,
    to: [{ email: userEmail }],
    subject,
    textContent,
    htmlContent,
  });

  if (ok) console.log("Password reset email sent to", userEmail);
  return ok;
}

module.exports = { sendPaymentConfirmation, sendPasswordReset };
