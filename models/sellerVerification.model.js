const mongoose = require('mongoose');
const crypto = require('crypto');

// ── Encryption / Decryption Utilities for KYC PII ────────────────────────────
const ALGORITHM = 'aes-256-cbc';

const getEncryptionKey = () => {
  // Key must be exactly 32 bytes (256 bits).
  // We sha256 hash the secret key to guarantee a 32-byte key size.
  const secret = process.env.KYC_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback_pixora_kyc_key_2026_safe';
  return crypto.createHash('sha256').update(secret).digest();
};

const encrypt = (val) => {
  if (val === null || val === undefined || val === '') return val;
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
    let encrypted = cipher.update(String(val), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('[SECURITY ERROR] Encryption failed:', err);
    return val;
  }
};

const decrypt = (val) => {
  if (val === null || val === undefined || val === '') return val;
  try {
    const parts = val.split(':');
    if (parts.length !== 2) return val; // Legacy plaintext data fallback
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[SECURITY ERROR] Decryption failed:', err);
    return val;
  }
};

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
    get: decrypt,
    set: encrypt,
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
    extractedText: { type: String, default: '', get: decrypt, set: encrypt },
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
}, {
  // Ensure getters run when transforming Mongoose documents to JSON or objects
  toJSON: { getters: true },
  toObject: { getters: true }
});

SellerVerificationSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('SellerVerification', SellerVerificationSchema);