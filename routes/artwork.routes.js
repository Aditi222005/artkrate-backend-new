// routes/artwork.routes.js
const express = require("express");
const router = express.Router();
const SellerPost = require("../models/seller.post");
const User = require("../models/user.model");
const { verifyToken } = require("../middlewares/verifyToken");
const logActivity = require("../utils/logActivity");

// Get all artworks liked by the current user
router.get("/liked/mine", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const likedArtworks = await SellerPost.find({ likes: userId }).populate({
      path: "sellerId",
      model: "users",
      select: "name profilePhoto address country followers bio",
    });
    res.status(200).json({ artworks: likedArtworks });
  } catch (error) {
    console.error("Error fetching liked artworks:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get artwork details by ID
router.get("/:id", async (req, res) => {
  try {
    const postId = req.params.id;

    const artwork = await SellerPost.findById(postId)
      .populate({
        path: "sellerId",
        model: "users",
        select: "name profilePhoto address country followers bio",
      })
      .populate({
  path: "likes",
  model: "users",
  select: "name _id", // fetch name and _id of liked users
});


    if (!artwork) {
      return res.status(404).json({ message: "Artwork not found" });
    }

    res.status(200).json({ artwork });
  } catch (error) {
    console.error("Error fetching artwork:", error);
    res.status(500).json({ message: "Server error" });
  }
});
router.post("/:id/view", verifyToken, async (req, res) => {
  try {
    const post = await SellerPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Artwork not found" });

    post.views += 1;
    await post.save();

    res.status(200).json({ message: "View added", views: post.views });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});
router.post("/:id/like", verifyToken, async (req, res) => {
  try {
    const post = await SellerPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Artwork not found" });

    const userId = req.user.id;
    const alreadyLiked = post.likes.includes(userId);

    if (alreadyLiked) {
      post.likes.pull(userId);
    } else {
      post.likes.push(userId);
      // Emit activity for the artwork owner (only when liking, not unliking)
      if (post.sellerId.toString() !== userId.toString()) {
        logActivity({
          userId: post.sellerId,
          type: "artwork_liked",
          title: "Artwork liked",
          detail: `"${post.title}" received a new like`,
          artworkId: post._id,
          relatedUserId: userId,
        });
      }
    }

    await post.save();

    const updatedPost = await SellerPost.findById(req.params.id).populate({
      path: "likes",
      model: "users",
      select: "name _id",
    });

    res.status(200).json({
      message: alreadyLiked ? "Unliked" : "Liked",
      liked: !alreadyLiked,
      likes: updatedPost.likes,
    });
  } catch (err) {
    console.error("Like error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
