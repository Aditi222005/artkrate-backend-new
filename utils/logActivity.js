const Activity = require('../models/activity.model');

/**
 * Persist an activity event. Fires-and-forgets — errors are logged but
 * never bubble up to the caller so they never break the primary request.
 *
 * @param {Object} params
 * @param {ObjectId|string} params.userId       - Owner of the activity feed entry
 * @param {string}          params.type         - One of the Activity.type enum values
 * @param {string}          params.title        - Short headline, e.g. "Artwork sold"
 * @param {string}          [params.detail]     - Supporting copy
 * @param {ObjectId|string} [params.artworkId]  - Related artwork (optional)
 * @param {ObjectId|string} [params.relatedUserId] - Related user (optional)
 */
const logActivity = async ({ userId, type, title, detail = '', artworkId = null, relatedUserId = null }) => {
  try {
    await Activity.create({ userId, type, title, detail, artworkId, relatedUserId });
  } catch (err) {
    // Non-fatal — log but never throw
    console.error('[logActivity] Failed to write activity event:', err.message);
  }
};

module.exports = logActivity;
