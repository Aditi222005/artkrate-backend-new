const express = require("express");
const router = express.Router();
const SellerPost = require("../models/seller.post");
const cloudinary = require("../utils/cloudinary");
const upload = require("../middlewares/multer");
const User = require("../models/user.model");
const auth = require("../middlewares/auth");
const logActivity = require("../utils/logActivity");

// helper to upload buffer
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "seller_artworks" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(fileBuffer);
  });
};

router.get("/mine", auth, async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch user from DB to confirm role
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Ensure user is a seller
    if (user.userType !== "seller") {
      return res.status(403).json({ message: "Only sellers can access their artworks" });
    }

    // Fetch posts by sellerId
    const posts = await SellerPost.find({ sellerId: userId }).sort({ createdAt: -1 });

    res.status(200).json(posts);
  } catch (error) {
    console.error("Error fetching seller posts:", error);
    res.status(500).json({ message: "Server error while fetching posts" });
  }
});


router.post("/create", auth, upload.array("images", 5), async (req, res) => {
  try {
    console.log("USER:", req.user);
    console.log("BODY:", req.body);
    console.log("FILES:", req.files);

    if (req.user.userType !== "seller") {
      return res.status(403).json({ message: "Only sellers can post artwork" });
    }

    const { title, price, category, description } = req.body;

    if (!title || !price || !category || !description) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "At least one image is required" });
    }

    const imageUrls = await Promise.all(
      req.files.map(file => uploadToCloudinary(file.buffer))
    );

    const post = new SellerPost({
      title,
      price: parseFloat(price),
      category,
      description,
      images: imageUrls,
      sellerId: req.user._id
    });

    await post.save();

    // Emit activity for the seller
    logActivity({
      userId: req.user._id,
      type: 'artwork_posted',
      title: 'Artwork posted',
      detail: `You listed "${title}" on the marketplace`,
      artworkId: post._id,
    });

    res.status(201).json({ message: "Artwork posted successfully", post });
  } catch (err) {
    console.error("❌ Error creating post:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.get("/all", async (req, res) => {
  try {
    const { category, priceMin, priceMax, medium, style, orientation, status, search } = req.query;

    const query = {};

    if (category && category !== 'all') {
      query.category = category;
    }
    if (medium && medium !== 'all') {
      query.medium = { $regex: new RegExp(medium, "i") };
    }
    if (style && style !== 'all') {
      query.style = { $regex: new RegExp(style, "i") };
    }
    if (orientation && orientation !== 'all') {
      query.orientation = orientation;
    }
    if (status && status !== 'all') {
      query.inventoryStatus = status;
    }

    if (priceMin || priceMax) {
      query.price = {};
      if (priceMin) query.price.$gte = parseFloat(priceMin);
      if (priceMax) query.price.$lte = parseFloat(priceMax);
    }

    if (search) {
      query.$or = [
        { title: { $regex: new RegExp(search, "i") } },
        { description: { $regex: new RegExp(search, "i") } },
        { medium: { $regex: new RegExp(search, "i") } },
        { style: { $regex: new RegExp(search, "i") } },
      ];
    }

    const posts = await SellerPost.find(query).populate({
      path: "sellerId",
      model: "users",
      select: "name profilePhoto"
    });

    res.status(200).json({ posts });
  } catch (err) {
    console.error("Error fetching seller posts:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/artists", auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const posts = await SellerPost.find().populate({
      path: "sellerId",
      model: "users",
      select: "name profilePhoto address country followers bio",
    });

    const artistMap = new Map();

    posts.forEach((post) => {
      const seller = post.sellerId;
      const sellerId = seller._id.toString();

      if (!artistMap.has(sellerId)) {
        const isFollowing = seller.followers?.some(
          (followerId) => followerId.toString() === currentUserId
        );

        artistMap.set(sellerId, {
          id: sellerId,
          name: seller.name,
          avatar:
            seller.profilePhoto ||
            `https://source.unsplash.com/150x150/?portrait,artist,${seller.name}`,
          location: seller.address || seller.country || "Unknown",
          specialty: post.category || "Mixed Media",
          coverImage: post.images?.[0] || null,
          artworksCount: 1,
          followersCount: seller.followers?.length || 0,
          isFollowing,
          rating: (Math.random() * 1.5 + 3.5).toFixed(1),
          bio:
            seller.bio ||
            `A passionate artist specializing in ${post.category}`,
          artworks: [post],
          views: post.views || 0, // Initialize views from first post
        });
      } else {
        const artist = artistMap.get(sellerId);
        artist.artworksCount += 1;
        artist.artworks.push(post);
        artist.views += post.views || 0; // Accumulate views
      }
    });

    const artists = Array.from(artistMap.values());

    res.status(200).json({ artists });
  } catch (err) {
    console.error("Error fetching artists:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const postId = req.params.id;

    const post = await SellerPost.findById(postId);
    if (!post) return res.status(404).json({ message: "Artwork not found" });

    if (post.sellerId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized to delete this artwork" });
    }

    await SellerPost.findByIdAndDelete(postId);
    res.status(200).json({ message: "Artwork deleted successfully" });
  } catch (err) {
    console.error("Error deleting artwork:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── PATCH /like/:id — Toggle like on an artwork ──────────────────────────────
router.patch("/like/:id", auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const post = await SellerPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Artwork not found" });

    const alreadyLiked = post.likes.includes(userId);
    if (alreadyLiked) {
      post.likes.pull(userId);
    } else {
      post.likes.push(userId);
      // Only emit activity when a like is added (not removed), and only if liker ≠ owner
      if (post.sellerId.toString() !== userId.toString()) {
        logActivity({
          userId: post.sellerId,
          type: 'artwork_liked',
          title: 'Artwork liked',
          detail: `"${post.title}" received a new like`,
          artworkId: post._id,
          relatedUserId: userId,
        });
      }
    }

    await post.save();
    res.status(200).json({ liked: !alreadyLiked, likesCount: post.likes.length });
  } catch (err) {
    console.error("Like error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;