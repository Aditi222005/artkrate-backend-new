const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    artworkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SellerPost',
      required: true,
    },
    artworkTitle: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    tax: { 
      type: Number, 
      default: 0 
    },
    shippingFee: { 
      type: Number, 
      default: 0 
    },
    totalPaid: { 
      type: Number, 
      required: true,
      default: function() { return this.price; }
    },
    status: {
      type: String,
      enum: ['Pending', 'Processing', 'Completed', 'Failed', 'Refunded', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
      default: 'Pending',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['razorpay', 'cod'],
      default: 'razorpay',
      index: true,
    },
    // Razorpay flat fields (backward compatible)
    razorpayOrderId: {
      type: String,
      index: true,
    },
    paymentId: {
      type: String,
      index: true,
    },
    
    // Logistics & Shipments
    shippingDetails: {
      recipientName: { type: String, default: "" },
      addressLine: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      country: { type: String, default: "" },
      zipCode: { type: String, default: "" },
      phone: { type: String, default: "" },
      trackingNumber: { type: String },
      courierCompany: { type: String },
      shippingLabelUrl: { type: String },
      deliveryOtpHash: { type: String }
    },

    // Detailed payment metadata
    paymentDetails: {
      razorpayOrderId: { type: String },
      paymentId: { type: String },
      invoiceNumber: { type: String },
      paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' }
    },

    trackingTimeline: [{
      status: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      description: { type: String }
    }]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
