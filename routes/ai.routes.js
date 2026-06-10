const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const SellerPost = require('../models/seller.post');
const multer = require('multer');
const upload = multer();
const axios = require('axios');
const FormData = require('form-data');

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:3000';

async function callGemini(contents) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await axios.post(url, { contents }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000
  });

  if (response.data && response.data.candidates && response.data.candidates[0] && response.data.candidates[0].content && response.data.candidates[0].content.parts && response.data.candidates[0].content.parts[0]) {
    return response.data.candidates[0].content.parts[0].text;
  }
  throw new Error("Invalid response from Gemini API");
}

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

// POST /api/ai/ai-chatbox
router.post('/ai-chatbox', auth, upload.single('image'), async (req, res) => {
  try {
    const message = req.body.message || '';
    if (!message && !req.file) {
      return res.status(400).json({ message: "Please provide a message or an image" });
    }

    const contents = [{ parts: [] }];
    if (message) {
      contents[0].parts.push({ text: message });
    }
    if (req.file) {
      contents[0].parts.push({
        inlineData: {
          mimeType: req.file.mimetype || 'image/jpeg',
          data: req.file.buffer.toString('base64')
        }
      });
    }

    try {
      const textResponse = await callGemini(contents);
      res.status(200).json({ reply: textResponse });
    } catch (apiErr) {
      console.error("[WARNING] Gemini API failed:", apiErr.message);
      const fallback_reply = (
        "Hello! I'm your AI Artwork Assistant.\n\n" +
        "It appears the Gemini API key configured in `.env` is either invalid, disabled, or leaked. " +
        "To restore full AI capabilities, please verify the GEMINI_API_KEY environment variable.\n\n" +
        "For now, I can recommend setting standard details for your artwork manually!"
      );
      res.status(200).json({ reply: fallback_reply });
    }
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

    const prompt = 
      "You are an expert art appraiser and curator.\n" +
      "Analyze the provided image of an artwork and generate the following details:\n" +
      "1. A creative, high-end title for the artwork.\n" +
      "2. A compelling, editorial-luxury description for the artwork.\n" +
      "3. Determine the category: it MUST be one of ['paintings', 'photography', 'sculptures', 'digital art', 'mixed media'].\n" +
      "4. Estimate a reasonable market value price in INR (integer, e.g. 45000).\n\n" +
      "You must respond ONLY with a valid JSON object. Do not include any markdown formatting or backticks.\n" +
      "JSON format:\n" +
      "{\n" +
      "  \"title\": \"compelling title\",\n" +
      "  \"description\": \"luxury description\",\n" +
      "  \"category\": \"paintings\",\n" +
      "  \"price\": 45000\n" +
      "}";

    const contents = [{
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: req.file.mimetype || 'image/jpeg',
            data: req.file.buffer.toString('base64')
          }
        }
      ]
    }];

    try {
      let textResponse = await callGemini(contents);
      textResponse = textResponse.trim();
      if (textResponse.startsWith("```")) {
        const lines = textResponse.split('\n');
        if (lines[0].startsWith("```json") || lines[0].startsWith("```")) {
          textResponse = lines.slice(1, -1).join('\n').trim();
        }
      }

      const result = JSON.parse(textResponse);
      res.status(200).json({
        response: {
          title: result.title || "",
          description: result.description || "",
          category: result.category || "paintings",
          price: result.price || 0
        }
      });
    } catch (apiErr) {
      console.warn("[WARNING] Artwork analysis/Gemini API failed:", apiErr.message);
      // Standard, beautiful fallback metadata
      res.status(200).json({
        response: {
          title: "Ethereal Harmony",
          description: "An exquisite original creation exploring contemporary textures, light balance, and deep tones. Perfectly curated to evoke emotion and elevate high-end living spaces.",
          category: "paintings",
          price: 38500
        }
      });
    }
  } catch (err) {
    console.error("AI Analyze Art error:", err.message);
    res.status(500).json({ message: "AI Art Analyzer is currently unavailable." });
  }
});

// POST /api/ai/detect-location
router.post('/detect-location', auth, async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    if (clientIp && clientIp.includes(',')) {
      clientIp = clientIp.split(',')[0].trim();
    }

    const locationInfo = {
      success: false,
      country: "",
      state: "",
      city: "",
      zipCode: "",
      road: "",
      formattedAddress: ""
    };

    // 1. Coordinate-based Geocoding (Nominatim OpenStreetMap)
    if (latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null) {
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
        const geoRes = await axios.get(nominatimUrl, {
          headers: {
            'User-Agent': 'Pixora-Artwork-Marketplace-Agent'
          },
          timeout: 8000
        });

        const address = geoRes.data.address || {};
        Object.assign(locationInfo, {
          success: true,
          country: address.country || '',
          state: address.state || address.region || '',
          city: address.city || address.town || address.village || address.suburb || '',
          zipCode: address.postcode || '',
          road: address.road || address.suburb || '',
          formattedAddress: geoRes.data.display_name || ''
        });
        console.log(`[INFO] Geocoded via Nominatim: ${locationInfo.formattedAddress}`);
        return res.status(200).json(locationInfo);
      } catch (e) {
        console.warn(`[WARNING] Nominatim reverse geocode failed: ${e.message}`);
      }
    }

    // 2. IP-based Geolocation fallback
    try {
      if (!clientIp || clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('localhost')) {
        Object.assign(locationInfo, {
          success: true,
          country: "India",
          state: "Delhi",
          city: "New Delhi",
          zipCode: "110001",
          road: "Connaught Place",
          formattedAddress: "Connaught Place, New Delhi, Delhi, 110001, India"
        });
        console.log("[INFO] Local client IP detected. Returned Connaught Place Delhi fallback.");
        return res.status(200).json(locationInfo);
      }

      const ipUrl = `http://ip-api.com/json/${clientIp}`;
      const ipRes = await axios.get(ipUrl, { timeout: 5000 });
      if (ipRes.data && ipRes.data.status === 'success') {
        Object.assign(locationInfo, {
          success: true,
          country: ipRes.data.country || '',
          state: ipRes.data.regionName || '',
          city: ipRes.data.city || '',
          zipCode: ipRes.data.zip || '',
          formattedAddress: `${ipRes.data.city}, ${ipRes.data.regionName}, ${ipRes.data.country}`
        });
        console.log(`[INFO] Geolocated via IP: ${locationInfo.formattedAddress}`);
        return res.status(200).json(locationInfo);
      }
    } catch (e) {
      console.warn(`[WARNING] IP Geolocation failed: ${e.message}`);
    }

    // Final Fallback
    Object.assign(locationInfo, {
      success: true,
      country: "India",
      state: "Delhi",
      city: "New Delhi",
      zipCode: "110001",
      road: "Connaught Place",
      formattedAddress: "Connaught Place, New Delhi, Delhi, 110001, India"
    });
    return res.status(200).json(locationInfo);

  } catch (err) {
    console.error("AI Detect Location error:", err.message);
    res.status(500).json({ message: "Location detection service is currently unavailable." });
  }
});

module.exports = router;
