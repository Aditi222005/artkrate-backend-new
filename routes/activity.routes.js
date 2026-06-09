const express = require('express');
const router = express.Router();
const Activity = require('../models/activity.model');
const auth = require('../middlewares/auth');

// ════════════════════════════════════════════════════════════════════════════
// GET /api/activity — Fetch the logged-in user's recent activity feed
// ════════════════════════════════════════════════════════════════════════════
router.get('/', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const activities = await Activity.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('relatedUserId', 'name profilePhoto')
      .populate('artworkId', 'title images');

    res.status(200).json({ activities });
  } catch (err) {
    console.error('Activity fetch error:', err);
    res.status(500).json({ message: 'Failed to fetch activity' });
  }
});

module.exports = router;
