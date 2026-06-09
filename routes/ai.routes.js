const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const SellerPost = require('../models/seller.post');

// POST /api/ai/generate-metadata
router.post('/generate-metadata', auth, async (req, res) => {
  try {
    const { title, medium, style } = req.body;
    if (!title || !medium || !style) {
      return res.status(400).json({ message: "Parameters title, medium, and style are required." });
    }

    const autoDescription = `A striking ${style} composition utilizing ${medium} and premium materials. "${title}" captures a unique depth, showcasing sophisticated texture work and a curated palette that anchors high-end spaces.`;
    const autoTags = [style.toLowerCase(), medium.toLowerCase(), "fine art", "editorial", "luxury", "original"];

    res.status(200).json({
      description: autoDescription,
      tags: autoTags
    });
  } catch (err) {
    console.error("AI Generation error:", err);
    res.status(500).json({ message: "Server error during AI generation." });
  }
});

// GET /api/ai/recommendations
router.get('/recommendations', auth, async (req, res) => {
  try {
    // Content-based recommendation: fetch user's recently viewed/liked styles
    // Here we query SellerPosts based on liked items
    const userId = req.user._id;

    // Find posts liked by user
    const likedPosts = await SellerPost.find({ likes: userId });
    
    let query = { inventoryStatus: 'available' };

    if (likedPosts.length > 0) {
      const preferredStyles = likedPosts.map(p => p.style);
      const preferredCategories = likedPosts.map(p => p.category);
      
      query.$or = [
        { style: { $in: preferredStyles } },
        { category: { $in: preferredCategories } }
      ];
      // Exclude already liked ones
      query._id = { $nin: likedPosts.map(p => p._id) };
    }

    const recommendations = await SellerPost.find(query)
      .populate('sellerId', 'name')
      .limit(6);

    res.status(200).json({ recommendations });
  } catch (err) {
    console.error("Recommendations error:", err);
    res.status(500).json({ message: "Server error while fetching recommendations." });
  }
});

module.exports = router;
