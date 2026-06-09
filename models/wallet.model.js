const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  type: { type: String, enum: ['credit', 'debit', 'payout'], required: true },
  status: { type: String, enum: ['pending', 'cleared', 'withdrawn', 'failed'], default: 'pending' },
  description: { type: String, required: true },
  referenceId: { type: mongoose.Schema.Types.ObjectId },
  createdAt: { type: Date, default: Date.now }
});

const walletSchema = new mongoose.Schema({
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, unique: true },
  balance: { type: Number, default: 0, min: 0 },
  pendingPayouts: { type: Number, default: 0, min: 0 },
  ledger: [ledgerEntrySchema]
}, { timestamps: true });

module.exports = mongoose.model('Wallet', walletSchema);
