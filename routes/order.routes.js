const express = require('express');
const router = express.Router();
const Order = require('../models/orders');
const SellerPost = require('../models/seller.post');
const auth = require("../middlewares/auth");
const logActivity = require("../utils/logActivity");

// 🔸 Place Orders for All Cart Items
router.post("/checkout", auth, async (req, res) => {
  try {
    const buyerId = req.user._id; // ✅ taken from verified user
    const { cartItems } = req.body;

    const createdOrders = [];

    for (let artworkId of cartItems) {
      const artwork = await SellerPost.findById(artworkId);
      if (!artwork) continue;

      const order = new Order({
        buyerId,
        sellerId: artwork.sellerId,
        artworkId: artwork._id,
        artworkTitle: artwork.title,
        price: artwork.price,
      });

      await order.save();
      createdOrders.push(order);

      // Activity events
      logActivity({
        userId: artwork.sellerId,
        type: 'artwork_sold',
        title: 'Artwork sold',
        detail: `"${artwork.title}" was purchased`,
        artworkId: artwork._id,
        relatedUserId: buyerId,
      });
      logActivity({
        userId: buyerId,
        type: 'artwork_purchased',
        title: 'Artwork purchased',
        detail: `You purchased "${artwork.title}"`,
        artworkId: artwork._id,
        relatedUserId: artwork.sellerId,
      });
    }

    res.status(201).json({ message: "Orders placed successfully", orders: createdOrders });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// 🔸 Get Orders for Seller (Protected - only seller can access their own orders)
router.get('/seller', auth, async (req, res) => {
  try {
    const sellerId = req.user._id;
    
    // Verify user is a seller
    if (req.user.userType !== 'seller') {
      return res.status(403).json({ message: "Access denied. Only sellers can view their orders." });
    }

    const orders = await Order.find({ sellerId })
      .sort({ createdAt: -1 })
      .populate('artworkId buyerId');
    
    res.json({ orders, count: orders.length });
  } catch (err) {
    console.error("Seller orders fetch error:", err);
    res.status(500).json({ message: "Failed to fetch seller orders" });
  }
});

// 🔸 Get Orders for Buyer (Protected - only buyer can access their own orders)
router.get('/buyer', auth, async (req, res) => {
  try {
    const buyerId = req.user._id;
    
    const orders = await Order.find({ buyerId })
      .sort({ createdAt: -1 })
      .populate('artworkId sellerId');
    
    res.json({ orders, count: orders.length });
  } catch (err) {
    console.error("Buyer orders fetch error:", err);
    res.status(500).json({ message: "Failed to fetch buyer orders" });
  }
});

// 🔸 Get All Orders for Admin (Protected - only admin can access)
router.get('/admin/all', auth, async (req, res) => {
  try {
    // Verify user is admin
    if (req.user.userType !== 'admin') {
      return res.status(403).json({ message: "Access denied. Only admins can view all orders." });
    }

    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .populate('artworkId buyerId sellerId');
    
    res.json({ orders, count: orders.length });
  } catch (err) {
    console.error("Admin orders fetch error:", err);
    res.status(500).json({ message: "Failed to fetch all orders" });
  }
});

// 🔸 Update Order Status (Seller can update their order status)
router.patch('/:orderId/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.orderId;
    
    // Verify user is a seller
    if (req.user.userType !== 'seller') {
      return res.status(403).json({ message: "Access denied. Only sellers can update order status." });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify the order belongs to this seller
    if (order.sellerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied. You can only update your own orders." });
    }

    order.status = status;
    order.updatedAt = new Date();
    await order.save();

    res.json({ message: "Order status updated successfully", order });
  } catch (err) {
    console.error("Order status update error:", err);
    res.status(500).json({ message: "Failed to update order status" });
  }
});

// 🔸 Get Order Details by ID (Protected - only involved parties can view)
router.get('/:orderId', auth, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.user._id;

    const order = await Order.findById(orderId)
      .populate('artworkId buyerId sellerId');

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify user is involved in this order (buyer, seller, or admin)
    const isBuyer = order.buyerId._id.toString() === userId.toString();
    const isSeller = order.sellerId._id.toString() === userId.toString();
    const isAdmin = req.user.userType === 'admin';

    if (!isBuyer && !isSeller && !isAdmin) {
      return res.status(403).json({ message: "Access denied. You can only view orders you're involved in." });
    }

    res.json({ order });
  } catch (err) {
    console.error("Order details fetch error:", err);
    res.status(500).json({ message: "Failed to fetch order details" });
  }
});

module.exports = router;
