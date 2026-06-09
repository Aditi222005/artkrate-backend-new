const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const SellerPost = require('../models/seller.post');
const multer = require('multer');
const upload = multer();
const axios = require('axios');
const FormData = require('form-data');

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:3000';

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
})
// POST /api/ai/ai-chatbox
router.post('/ai-chatbox', auth, upload.single('image'), async (req, res) => {
  try {
    const message = req.body.message || '';
    const form = new FormData();
    form.append('message', message);

    if (req.file) {
      form.append('image', req.file.buffer, {
        filename: req.file.originalname || 'image.jpg',
        contentType: req.file.mimetype || 'image/jpeg',
      });
    }

    const response = await axios.post(`${AI_SERVER_URL}/api/ai-chatbox`, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
    });

    res.status(200).json(response.data);
  } catch (err) {
    console.error("AI Chatbox error:", err.message);
    res.status(500).json({ message: "AI Assistant is currently unavailable." });
  }
});

// POST /api/ai/analyze-art
router.post('/analyze-art', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const form = new FormData();
    form.append('image', req.file.buffer, {
      filename: req.file.originalname || 'image.jpg',
      contentType: req.file.mimetype || 'image/jpeg',
    });

    const response = await axios.post(`${AI_SERVER_URL}/api/analyze-art`, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
    });

    res.status(200).json(response.data);
  } catch (err) {
    console.error("AI Analyze Art error:", err.message);
    res.status(500).json({ message: "AI Art Analyzer is currently unavailable." });
  }
});

// POST /api/ai/detect-location
router.post('/detect-location', auth, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    const response = await axios.post(`${AI_SERVER_URL}/api/detect-location`, {
      latitude,
      longitude
    }, {
      headers: {
        'X-Forwarded-For': clientIp,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    res.status(200).json(response.data);
  } catch (err) {
    console.error("AI Detect Location error:", err.message);
    res.status(500).json({ message: "Location detection service is currently unavailable." });
  }
});

module.exports = router;
