const mongoose = require('mongoose');

const SellerVerificationSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true,
    unique: true,
  },

  // ── Document Info ───────────────────────────────────────────────────────────
  documentType: {
    type: String,
    enum: ['aadhar', 'pan', 'driving_license', 'voter_id', 'passport'],
    required: true,
  },
  documentNumber: {
    type: String,
    required: true,
  },

  // ── Cloudinary URLs ─────────────────────────────────────────────────────────
  documentFront: { type: String, required: true },
  documentBack:  { type: String, default: '' },
  selfiePhoto:   { type: String, default: '' },       // selfie for face match

  // ── Verification Pipeline ───────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['not_submitted', 'pending', 'ocr_passed', 'ocr_failed', 'verified', 'rejected'],
    default: 'not_submitted',
  },

  // ── OCR Results ──────────────────────────────────────────────────────────────
  ocrResult: {
    extractedText: { type: String, default: '' },
    nameMatch:     { type: Boolean, default: null },
    numberMatch:   { type: Boolean, default: null },
    ocrScore:      { type: Number, default: 0 },   // 0–100
    ocrRunAt:      { type: Date },
  },

  // ── Face Match Results ───────────────────────────────────────────────────────
  faceMatch: {
    score:     { type: Number, default: null },   // 0–100
    level:     { type: String, enum: ['high', 'medium', 'low'], default: null },
    distance:  { type: Number, default: null },   // raw Euclidean distance
    matched:   { type: Boolean, default: null },  // distance < 0.5
    faceRunAt: { type: Date },
  },


  remarks:     { type: String, default: '' },
  reviewedAt:  { type: Date },
  submittedAt: { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
});

SellerVerificationSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('SellerVerification', SellerVerificationSchema);