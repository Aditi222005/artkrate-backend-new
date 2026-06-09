const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  artworkId: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerPost', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  images: [{ type: String }],
  isVerifiedPurchase: { type: Boolean, default: true }
}, { timestamps: true });

reviewSchema.index({ buyerId: 1, artworkId: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
