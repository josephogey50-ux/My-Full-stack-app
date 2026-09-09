import Participant from '../model/Participant.js';
import { sendPaymentConfirmationEmail } from './mailer.js';
import logger from './logger.js';

// ─── Trip cost config ───
// Single source of truth for how much the trip costs. Read once at module
// load; server.js's required-env check (see below) guarantees these are
// valid positive numbers before the app ever starts accepting traffic.
// Two tiers, both PER PERSON: a solo traveler (room "matched" with a
// same-sex roommate) pays SINGLE_TRIP_TOTAL_NAIRA; a "paired" traveler
// (part of a couple) pays COUPLE_TRIP_TOTAL_NAIRA — each partner still
// registers and pays as their own Participant record, each at this rate.
// See tripTotalForRoomPreference() below.
// ── Live bindings, not one-shot constants ──
// ES module `import` statements are hoisted: every statically-imported
// module (this one included, via routes/register.js and routes/payments.js)
// finishes executing its top-level code BEFORE server.js's own body runs —
// so if server.js's `dotenv.config()` call were what populated process.env,
// it would already be too late by the time this file first evaluated these
// as plain `const`s (they'd lock in as NaN in local dev, where env vars only
// live in .env). Exporting them as `let` and recomputing in
// initPaymentConfig() — called from server.js immediately after
// dotenv.config() — works because `import { SINGLE_TRIP_TOTAL_NAIRA }` is a
// live reference to this module's binding: every function below that reads
// it picks up the refreshed value at call time, not at import time.
export let SINGLE_TRIP_TOTAL_NAIRA = Number(process.env.SINGLE_TRIP_TOTAL_AMOUNT_NGN);
export let COUPLE_TRIP_TOTAL_NAIRA = Number(process.env.COUPLE_TRIP_TOTAL_AMOUNT_NGN);
export let MIN_INITIAL_DEPOSIT_NGN = computeMinDepositFloor();

function computeMinDepositFloor() {
  const raw = Number(process.env.MIN_INITIAL_DEPOSIT_NGN);
  return Number.isFinite(raw) && raw > 0 ? raw : 100000;
}

// Call once from server.js, right after dotenv.config() runs, so these
// reflect real .env values instead of the pre-dotenv undefined/NaN read
// above. A no-op in production platforms (Render, etc.) that inject env
// vars directly into process.env before the process even starts.
export function initPaymentConfig() {
  SINGLE_TRIP_TOTAL_NAIRA = Number(process.env.SINGLE_TRIP_TOTAL_AMOUNT_NGN);
  COUPLE_TRIP_TOTAL_NAIRA = Number(process.env.COUPLE_TRIP_TOTAL_AMOUNT_NGN);
  MIN_INITIAL_DEPOSIT_NGN = computeMinDepositFloor();
}

// A "paired" registrant owes the couple (per-person) total; everyone else
// (including the schema default, 'match') owes the single total.
export function tripTotalForRoomPreference(roomPreference) {
  return roomPreference === 'paired' ? COUPLE_TRIP_TOTAL_NAIRA : SINGLE_TRIP_TOTAL_NAIRA;
}

// Never allowed to exceed the participant's own trip total, so the cheaper
// tier still works.
export function minDepositForRoomPreference(roomPreference) {
  return Math.min(MIN_INITIAL_DEPOSIT_NGN, tripTotalForRoomPreference(roomPreference));
}

export function nairaToKobo(naira) {
  return Math.round(Number(naira) * 100);
}

export function koboToNaira(kobo) {
  return Math.round(Number(kobo)) / 100;
}

// ─── Paystack REST helpers ───
const PAYSTACK_BASE = 'https://api.paystack.co';

function paystackHeaders() {
  return {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
  };
}

export async function paystackInitializeTransaction({ email, amountNaira, reference, callbackUrl, metadata }) {
  const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: paystackHeaders(),
    body: JSON.stringify({
      email,
      amount: nairaToKobo(amountNaira),
      reference,
      callback_url: callbackUrl,
      currency: 'NGN',
      metadata
    })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.status) {
    throw new Error(data?.message || 'Paystack could not initialize this transaction.');
  }
  return data.data; // { authorization_url, access_code, reference }
}

// Always re-verify against Paystack's own API before crediting an account —
// never trust a webhook body or a client-supplied "it succeeded" claim on
// its own. This is Paystack's documented recommended pattern and it's what
// makes both the webhook and the client-redirect verify path trustworthy.
export async function paystackVerifyTransaction(reference) {
  const response = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: paystackHeaders()
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.status) {
    throw new Error(data?.message || 'Could not verify transaction with Paystack.');
  }
  return data.data; // { status: 'success'|'failed'|..., amount (kobo), channel, reference, ... }
}

// ─── Idempotent, atomic payment confirmation ───
// Both the webhook and the client "verify after redirect" endpoint call this.
// They can legitimately race each other (webhook arrives while the browser
// is also polling verify), so this uses the same atomic-update pattern as
// the login-lockout fix: the filter only matches a payment sub-document that
// is still 'pending', so a second concurrent call for the same reference
// matches nothing and silently no-ops instead of double-crediting the
// participant's balance.
export async function applyConfirmedPayment({ reference, amountNaira, channel }) {
  // Captured as plain numbers before the pipeline runs — Mongo evaluates
  // this per-document against each participant's own logistics.roomPreference,
  // so a solo and a paired registrant are compared against different totals
  // in the same $cond even though it's built from these two constants.
  const singleTotal = SINGLE_TRIP_TOTAL_NAIRA;
  const coupleTotal = COUPLE_TRIP_TOTAL_NAIRA;

  const updated = await Participant.findOneAndUpdate(
    {
      'checkout.payments': { $elemMatch: { reference, status: 'pending' } }
    },
    [
      {
        $set: {
          'checkout.payments': {
            $map: {
              input: '$checkout.payments',
              as: 'p',
              in: {
                $cond: [
                  { $and: [{ $eq: ['$$p.reference', reference] }, { $eq: ['$$p.status', 'pending'] }] },
                  {
                    $mergeObjects: [
                      '$$p',
                      { status: 'success', paidAt: new Date(), channel: channel || null, confirmedAmount: amountNaira }
                    ]
                  },
                  '$$p'
                ]
              }
            }
          },
          'checkout.amountPaid': { $add: [{ $ifNull: ['$checkout.amountPaid', 0] }, amountNaira] }
        }
      },
      {
        $set: {
          'checkout.paymentStatus': {
            $cond: [
              {
                $gte: [
                  '$checkout.amountPaid',
                  { $cond: [{ $eq: ['$logistics.roomPreference', 'paired'] }, coupleTotal, singleTotal] }
                ]
              },
              'Paid',
              'Partial'
            ]
          }
        }
      }
    ],
    // Mongoose 9 refuses an array (aggregation-pipeline) update unless this
    // is set explicitly — without it this throws "Cannot pass an array to
    // query updates unless the `updatePipeline` option is set", so every
    // payment verification (both this client-triggered path and the
    // Paystack webhook, which both call this function) failed with a 502
    // and no participant ever actually got credited, no matter how many
    // times Paystack confirmed the charge.
    { new: true, updatePipeline: true }
  );

  // null means: no participant had a *pending* payment with this reference —
  // either it was already confirmed by the other path (webhook vs. verify
  // race), or the reference is bogus. Caller decides how to report that.
  if (updated) {
    // Best-effort — a mail-provider hiccup must never undo a payment that's
    // already been credited, so this is deliberately fire-and-forget from
    // the caller's perspective (webhook already responded 200; the client
    // verify/resync response doesn't depend on this either).
    const tripTotal = tripTotalForRoomPreference(updated.logistics?.roomPreference);
    const remaining = Math.max(0, Math.round((tripTotal - (updated.checkout?.amountPaid || 0)) * 100) / 100);
    sendPaymentConfirmationEmail(updated.emailAddress, {
      firstName: updated.firstName,
      amountPaid: amountNaira,
      amountTotalPaid: updated.checkout?.amountPaid || 0,
      tripTotal,
      remainingBalance: remaining
    }).catch((err) => {
      logger.error({ err, emailAddress: updated.emailAddress, reference }, 'Failed to send payment confirmation email');
    });
  }

  return updated;
}

export async function findParticipantByPaymentReference(reference) {
  return Participant.findOne({ 'checkout.payments.reference': reference });
}
