const express = require("express");
const router = express.Router();
const Cart = require("../models/cart.model");
const SellerPost = require("../models/seller.post");
const auth = require("../middlewares/auth");
const User = require("../models/user.model"); // 🔥 Import User model to fetch seller details
const mongoose = require("mongoose"); // Import mongoose for ObjectId handling

// Add artwork to cart
router.post("/add/:artworkId", auth, async (req, res) => {
  const userId = req.user._id;
  const artworkId = req.params.artworkId;

  try {
    const artwork = await SellerPost.findById(artworkId);
    if (!artwork) return res.status(404).json({ message: "Artwork not found" });

    // 🔥 Fetch the seller using artwork.sellerId
    const seller = await User.findById(artwork.sellerId);
    const artistName = seller?.name || "Unknown Seller";

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const alreadyAdded = cart.items.find(item => item.artworkId.toString() === artworkId);
    if (alreadyAdded) {
      return res.status(400).json({ message: "Artwork already in cart" });
    }

    cart.items.push({
      artworkId,
      title: artwork.title,
      image: artwork.images[0],
      price: artwork.price,
      artist: artistName, // ✅ Name from the seller (user with userType: 'seller')
    });

    await cart.save();
    res.status(200).json({ message: "Added to cart", cart });
  } catch (err) {
    console.error("Add to cart error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get user cart
router.get("/", auth, async (req, res) => {
  const cart = await Cart.findOne({ userId: req.user._id });
  res.status(200).json({ cart });
});


router.delete("/remove/:artworkId", auth, async (req, res) => {
  try {
    const artworkId = req.params.artworkId;
    const objectId = new mongoose.Types.ObjectId(artworkId);

    const cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const itemExists = cart.items.some(item => item.artworkId.equals(objectId));
    if (!itemExists) {
      return res.status(404).json({ message: "Artwork not found in cart" });
    }

    cart.items = cart.items.filter(item => !item.artworkId.equals(objectId));

    if (cart.items.length === 0) {
      await Cart.deleteOne({ _id: cart._id });
      return res.status(200).json({ message: "Removed item and deleted empty cart", cart: null });
    }

    await cart.save();
    return res.status(200).json({ message: "Removed from cart", cart });

  } catch (err) {
    console.error("Remove from cart error:", err);
    return res.status(500).json({ message: "Server error while removing item" });
  }
});

router.delete("/clear", auth, async (req, res) => {
  try {
    await Cart.findOneAndDelete({ userId: req.user._id });
    res.status(200).json({ message: "Cart cleared successfully" });
  } catch (err) {
    console.error("Error clearing cart:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


module.exports = router;