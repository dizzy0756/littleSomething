const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const EMAIL_FROM = process.env.EMAIL_FROM;

let transporter = null;

function getTransporter() {
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10),
      secure: SMTP_PORT === "465",
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASSWORD,
      },
    });
  }
  return transporter;
}

async function sendPaymentConfirmation(userEmail, amount, linkUrl, expiresAt) {
  const t = getTransporter();
  if (!t) {
    console.warn("SMTP not configured — skipping payment confirmation email to", userEmail);
    return;
  }

  try {
    await t.sendMail({
      from: EMAIL_FROM || SMTP_USER,
      to: userEmail,
      subject: "Your LittleSomething surprise is ready ♥",
      text:
        "Hi there!\n\n" +
        "Your LittleSomething has been created and is waiting to be shared.\n\n" +
        "Private link: " + linkUrl + "\n" +
        "This link will expire on " + new Date(expiresAt).toLocaleDateString() + ".\n\n" +
        "Made with ♥",
      html:
        "<p>Hi there!</p>" +
        "<p>Your <strong>LittleSomething</strong> has been created and is waiting to be shared.</p>" +
        "<p><a href=\"" + linkUrl + "\">Open your surprise</a></p>" +
        "<p><small>This link will expire on " + new Date(expiresAt).toLocaleDateString() + ".</small></p>" +
        "<p>Made with ♥</p>",
    });
  } catch (err) {
    console.error("Failed to send payment confirmation email:", err);
  }
}

module.exports = { sendPaymentConfirmation };
