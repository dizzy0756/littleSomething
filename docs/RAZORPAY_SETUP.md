# Razorpay Setup Guide

## 1. Get Razorpay Test Credentials

1. Sign up at [razorpay.com](https://razorpay.com)
2. Go to **Settings → API Keys**
3. Generate **Test** mode keys (Key ID and Key Secret)
4. Copy both values

## 2. Configure Environment Variables

Add these to `server/.env`:

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

PAYMENT_AMOUNT=9900
PAYMENT_CURRENCY=INR
PRIVATE_LINK_EXPIRY_DAYS=7
```

### Optional — Email Notifications

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=your-email@gmail.com
```

If SMTP is not configured, emails are skipped and a warning is logged.

## 3. Install Dependencies

```bash
cd server
npm install
```

This installs `razorpay` and `nodemailer`.

## 4. Run the Server

```bash
cd server
npm start
```

The server will validate Razorpay keys on startup and fail fast if they are missing.

## 5. Test the Payment Flow

1. Open `http://localhost:3001/builder`
2. Log in or register
3. Customize a template
4. Click **Pay ₹99 & Generate Link**
5. Use Razorpay test card: `4111 1111 1111 1111` (any future expiry, any CVV)
6. Complete payment — you should be redirected to the success page with your private link

## 6. Webhook Setup (Production)

In production, configure the webhook URL in Razorpay Dashboard:

```
https://yourdomain.com/api/payments/webhook
```

Razorpay will send events (`payment.captured`, `payment.failed`, `order.paid`) to this endpoint. The webhook verifies the `X-Razorpay-Signature` header before processing.

## 7. Going Live

1. Switch Razorpay to **Live** mode
2. Generate live API keys
3. Update `.env` with live keys
4. Update webhook URL to your production domain
