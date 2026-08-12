import mongoose from 'mongoose';

// ─── Admin action audit trail ───
// Every organizer currently authenticates with the same shared ADMIN_API_KEY
// (see routes/admin.js), so there's no per-account identity to hang an audit
// trail off of. As a lightweight middle ground, admin login also collects a
// display name that gets embedded in the admin session JWT and recorded here
// against every money-affecting action — giving "who changed what, and from
// what to what" without building a full multi-account system.
const AuditLogSchema = new mongoose.Schema({
  adminName: { type: String, required: true, trim: true },
  action: { type: String, required: true },
  targetEmail: { type: String, required: true, trim: true, lowercase: true },
  before: { type: mongoose.Schema.Types.Mixed, default: {} },
  after: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

AuditLogSchema.index({ createdAt: -1 });

export default mongoose.model('AuditLog', AuditLogSchema);
