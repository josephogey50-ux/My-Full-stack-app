import nodemailer from 'nodemailer';

// ─── Gmail SMTP transporter ───
// Free tier: a regular Gmail account + an app password (not the account
// password itself — generate one at myaccount.google.com/apppasswords).
// Built lazily so a missing GMAIL_USER/GMAIL_APP_PASSWORD only breaks the
// forgot-PIN feature, not server startup — every other route works without it.
let transporter = null;

function getTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER/GMAIL_APP_PASSWORD are not configured.');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
  }
  return transporter;
}

export async function sendResetPinEmail(to, resetUrl) {
  await getTransporter().sendMail({
    from: `"AKWABA 001" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Reset your AKWABA 001 PIN',
    html: `
      <p>You (or someone else) asked to reset the PIN on your AKWABA 001 account.</p>
      <p><a href="${resetUrl}">Click here to set a new PIN</a>. This link expires in 30 minutes.</p>
      <p>If you didn't request this, you can safely ignore this email — your PIN won't change.</p>
    `
  });
}

// Fired from applyConfirmedPayment() — the single place both the Paystack
// webhook and every client-triggered verify/resync path funnel through — so
// every payment that actually gets credited sends exactly one of these,
// regardless of which path confirmed it.
export async function sendPaymentConfirmationEmail(to, { firstName, amountPaid, amountTotalPaid, tripTotal, remainingBalance }) {
  const isPaidInFull = remainingBalance <= 0;
  await getTransporter().sendMail({
    from: `"AKWABA 001" <${process.env.GMAIL_USER}>`,
    to,
    subject: isPaidInFull ? 'Payment received — you\'re fully paid for AKWABA 001! 🎉' : 'Payment received — AKWABA 001',
    html: `
      <p>Hi ${firstName || 'there'},</p>
      <p>We've received your payment of <strong>₦${amountPaid.toLocaleString()}</strong> for AKWABA 001.</p>
      <p>Total paid so far: <strong>₦${amountTotalPaid.toLocaleString()}</strong> of ₦${tripTotal.toLocaleString()}.</p>
      ${
        isPaidInFull
          ? '<p>You\'re fully paid up — see you on the road! 🎉</p>'
          : `<p>Remaining balance: <strong>₦${remainingBalance.toLocaleString()}</strong>. You can settle this anytime from your dashboard.</p>`
      }
      <p>You can review your full payment status and receipt from your dashboard at any time.</p>
    `
  });
}
