import mongoose from 'mongoose';

const ParticipantSchema = new mongoose.Schema({
  surname: { type: String, required: true, trim: true },
  firstName: { type: String, required: true, trim: true },
  emailAddress: { type: String, required: true, unique: true, lowercase: true, trim: true },
  // Unique + indexed: login looks users up by this field, so duplicates
  // would previously cause findOne() to silently return the wrong account.
  whatsAppNumber: { type: String, required: true, unique: true, trim: true },
  accountPin: { type: String, required: true },

  logistics: {
    docType: { type: String, default: 'International Passport' },
    roomPreference: { type: String, default: 'match' },
    roommateName: { type: String, default: '' },
    emergencyContact: { type: String, default: '' }
  },

  checkout: {
    plan: { type: String, default: 'Full Payment' },
    // Organizer-controlled only — never trust client-submitted payment amounts/status.
    paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Partial', 'Refunded'], default: 'Pending' },
    amountPaid: { type: Number, default: 0 },
    // Individual Paystack transaction attempts for this participant. Written by
    // /api/payments/initiate (pending), then flipped to success/failed by the
    // webhook or the client-verify path (see utils/utils_payments.js).
    payments: {
      type: [{
        reference: { type: String, required: true },
        amount: { type: Number, required: true }, // naira, amount requested at initiation
        status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
        initiatedAt: { type: Date, default: Date.now },
        paidAt: { type: Date, default: null },
        channel: { type: String, default: null },
        confirmedAmount: { type: Number, default: null } // naira, authoritative amount from Paystack verify
      }],
      default: []
    },
    receipt: {
      data: { type: Buffer, select: false }, // excluded by default; fetched explicitly for the receipt route
      contentType: { type: String },
      filename: { type: String },
      size: { type: Number },
      uploadedAt: { type: Date }
    }
  },

  currentStep: { type: Number, default: 1 },

  // ── Login throttling (defends the 4-digit PIN against brute force) ──
  security: {
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null }
  }
}, { timestamps: true });

ParticipantSchema.methods.isLocked = function () {
  return !!(this.security?.lockUntil && this.security.lockUntil > Date.now());
};

export default mongoose.model('Participant', ParticipantSchema);
