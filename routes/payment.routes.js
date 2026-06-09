const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const auth = require('../middlewares/auth');
const Order = require('../models/orders');
const SellerPost = require('../models/seller.post');
const logActivity = require('../utils/logActivity');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ────────────────────────────────────────────────────────────────────────────────
// POST /api/payment/create-order
// Creates a Razorpay order and returns the order id + key to the frontend
// ────────────────────────────────────────────────────────────────────────────────
router.post('/create-order', auth, async (req, res) => {
  try {
    const { cartItems } = req.body;

    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ message: 'Cart items are required' });
    }

    // Calculate total amount from actual artwork prices
    let totalAmount = 0;
    const artworks = [];

    for (const artworkId of cartItems) {
      const artwork = await SellerPost.findById(artworkId);
      if (!artwork) {
        return res.status(404).json({ message: `Artwork ${artworkId} not found` });
      }
      totalAmount += artwork.price;
      artworks.push(artwork);
    }

    // Convert to paise (Razorpay uses smallest currency unit)
    const amountInPaise = Math.round(totalAmount * 100);

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}_${req.user._id}`,
      notes: {
        buyerId: req.user._id.toString(),
        artworkIds: cartItems.join(','),
      },
    };

    const razorpayOrder = await razorpay.orders.create(options);

    res.status(200).json({
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      artworks: artworks.map(a => ({
        id: a._id,
        title: a.title,
        price: a.price,
      })),
    });
  } catch (err) {
    console.error('Razorpay create-order error:', err);
    res.status(500).json({ message: 'Failed to create payment order', error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// POST /api/payment/verify
// Verifies the Razorpay payment signature and creates DB orders
// ────────────────────────────────────────────────────────────────────────────────
router.post('/verify', auth, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      cartItems,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing payment verification fields' });
    }

    // Verify the HMAC signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Payment verification failed: invalid signature' });
    }

    // Signature valid — create orders in DB
    const buyerId = req.user._id;
    const createdOrders = [];

    for (const artworkId of cartItems) {
      const artwork = await SellerPost.findById(artworkId);
      if (!artwork) continue;

      const order = new Order({
        buyerId,
        sellerId: artwork.sellerId,
        artworkId: artwork._id,
        artworkTitle: artwork.title,
        price: artwork.price,
        status: 'Completed',
        paymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
      });

      await order.save();
      createdOrders.push(order);

      // Activity: seller gets a sale event
      logActivity({
        userId: artwork.sellerId,
        type: 'artwork_sold',
        title: 'Artwork sold',
        detail: `"${artwork.title}" was purchased`,
        artworkId: artwork._id,
        relatedUserId: buyerId,
      });

      // Activity: buyer gets a purchase event
      logActivity({
        userId: buyerId,
        type: 'artwork_purchased',
        title: 'Artwork purchased',
        detail: `You purchased "${artwork.title}"`,
        artworkId: artwork._id,
        relatedUserId: artwork.sellerId,
      });
    }

    res.status(201).json({
      message: 'Payment verified and orders created successfully',
      orders: createdOrders,
      paymentId: razorpay_payment_id,
    });
  } catch (err) {
    console.error('Payment verify error:', err);
    res.status(500).json({ message: 'Payment verification failed', error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// POST /api/payment/webhook  (raw body — middleware applied in server.js)
// Razorpay sends webhook events here to track payment status asynchronously
// ────────────────────────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    if (!webhookSecret || !signature) {
      return res.status(400).json({ message: 'Missing webhook secret or signature' });
    }

    // Verify webhook signature
    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.body) // req.body is raw Buffer here
      .digest('hex');

    if (expectedSig !== signature) {
      console.warn('Webhook signature mismatch');
      return res.status(400).json({ message: 'Invalid webhook signature' });
    }

    const event = JSON.parse(req.body.toString());
    console.log('Razorpay webhook event:', event.event);

    switch (event.event) {
      case 'payment.captured': {
        const paymentId = event.payload.payment.entity.id;
        const razorpayOrderId = event.payload.payment.entity.order_id;

        // Update order status to Completed
        await Order.updateMany(
          { razorpayOrderId },
          { status: 'Completed', paymentId }
        );
        break;
      }

      case 'payment.failed': {
        const razorpayOrderId = event.payload.payment.entity.order_id;
        await Order.updateMany(
          { razorpayOrderId },
          { status: 'Failed' }
        );
        break;
      }

      case 'refund.created': {
        const paymentId = event.payload.refund.entity.payment_id;
        await Order.updateMany(
          { paymentId },
          { status: 'Refunded' }
        );
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

// ────────────────────────────────────────────────────────────────────────────────
// GET /api/payment/key  — Returns the Razorpay key_id for frontend initialization
// ────────────────────────────────────────────────────────────────────────────────
router.get('/key', auth, (req, res) => {
  res.status(200).json({ keyId: process.env.RAZORPAY_KEY_ID });
});

module.exports = router;
