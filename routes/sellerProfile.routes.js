const express = require("express");
const router = express.Router();
const SellerPost = require("../models/seller.post");
const User = require("../models/user.model"); // Adjust path if needed
const auth = require("../middlewares/auth");



router.get("/:id", auth, async (req, res) => {
  try {
    const sellerId = req.params.id;
    const currentUserId = req.user.id;

    const seller = await User.findById(sellerId).select(
      "name username profilePhoto address country bio joinDate followers"
    );
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    const posts = await SellerPost.find({ sellerId }).sort({ createdAt: -1 });

    // 🔼 Increment views for each post
    if (posts.length > 0) {
      posts[0].views = (posts[0].views || 0) +1;
      await posts[0].save();
    }

    const updatedPosts = await SellerPost.find({ sellerId }).sort({ createdAt: -1 });

    const totalLikes = updatedPosts.reduce((sum, p) => sum + (p.likes?.length || 0), 0);
    const totalViews = updatedPosts.reduce((sum, p) => sum + (p.views || 0), 0);

    const profile = {
      name: seller.name,
      username: seller.username,
      avatar: seller.profilePhoto || `https://source.unsplash.com/150x150/?portrait,artist,${seller.name}`,
      coverImage: updatedPosts[0]?.images?.[0] || `https://source.unsplash.com/900x300/?art,abstract`,
      location: seller.address || seller.country || "Unknown",
      specialty: updatedPosts[0]?.category || "Multimedia Artist",
      joinDate: seller.joinDate || "N/A",
      bio: seller.bio || `Hi! I'm ${seller.name}, a passionate creator.`,
      verified: true,
      rating: (Math.random() * 1.5 + 3.5).toFixed(1),
      followers: seller.followers.length,
      isFollowing: seller.followers.includes(currentUserId),
      totalViews,
      totalLikes,
      stats: {
        artworks: updatedPosts.length,
        sales: Math.floor(Math.random() * 50 + 10),
        reviews: Math.floor(Math.random() * 100 + 20),
      },
      artworks: updatedPosts.map((post) => ({
        id: post._id,
        title: post.title,
        image: post.images?.[0] || "",
        price: post.price,
        likes: post.likes?.length || 0,
        views: post.views || 0,
      })),
    };

    res.status(200).json({ seller: profile });
  } catch (err) {
    console.error("Error fetching seller profile:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;