import express from 'express';
import Participant from '../model/Participant.js';

const router = express.Router();

// ─── GET /api/public/convoy ───────────────────────────────────────────────
// Powers the landing page's "Convoy" seat map. No auth — this is meant to be
// visible to anyone considering registering. Only ever reads
// checkout.paymentStatus (via projection) and createdAt for ordering, so no
// name/email/phone/PIN/receipt data can leak through this route even if the
// response shape changes later.
//
// Refunded participants are dropped entirely — they're no longer part of the
// trip, so they shouldn't occupy a seat. Everyone else occupies exactly one
// seat, colored by payment status: Paid -> confirmed, Partial -> deposit,
// Pending -> pending. There's no fixed capacity/"available" bucket — the
// convoy grows as people register.
router.get('/convoy', async (req, res, next) => {
  try {
    const participants = await Participant.find(
      { 'checkout.paymentStatus': { $ne: 'Refunded' } },
      { 'checkout.paymentStatus': 1, createdAt: 1 }
    )
      .sort({ createdAt: 1 })
      .lean();

    const STATUS_MAP = { Paid: 'confirmed', Partial: 'deposit', Pending: 'pending' };
    const seats = participants.map((p) => STATUS_MAP[p.checkout?.paymentStatus] || 'pending');

    const counts = seats.reduce(
      (acc, status) => {
        acc[status] += 1;
        return acc;
      },
      { confirmed: 0, deposit: 0, pending: 0 }
    );

    res.set('Cache-Control', 'public, max-age=30');
    res.json({ total: seats.length, ...counts, seats });
  } catch (err) {
    next(err);
  }
});

export default router;
