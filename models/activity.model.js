const mongoose = require('mongoose');

/**
 * Activity types:
 *  - artwork_sold      → seller received a sale
 *  - artwork_purchased → buyer purchased artwork
 *  - new_follower      → someone followed the user
 *  - artwork_liked     → user's artwork received a like
 *  - artwork_posted    → user uploaded a new artwork
 */
const activitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        'artwork_sold',
        'artwork_purchased',
        'new_follower',
        'artwork_liked',
        'artwork_posted',
      ],
    },
    // Human-readable headline, e.g. "Artwork sold"
    title: { type: String, required: true },
    // Supporting detail, e.g. '"Monsoon Reverie" was sold to a collector'
    detail: { type: String, default: '' },
    // Optional related resource IDs
    artworkId: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerPost', default: null },
    relatedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
  },
  { timestamps: true }
);

// Compound index for fast per-user feed queries
activitySchema.index({ userId: 1, createdAt: -1 });

const Activity = mongoose.model('Activity', activitySchema);
module.exports = Activity;
