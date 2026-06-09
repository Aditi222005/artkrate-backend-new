const mongoose = require('mongoose');

const sellerPostSchema = new mongoose.Schema({
    title: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, required: true },
    category: {
        type: String,
        required: true,
        enum: ['paintings', 'photography', 'sculptures', 'digital art', 'mixed media', 'other'],
    },
    images: {  // changed from image -> images (array)
        type: [String],
        required: true,
    },
    sellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true,
    },
    profileImage: {  // changed from profileImage -> profileImage (string)
        type: [String],
        required: true,
    },
    views: { type: Number, default: 0 },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "users" }],
    salePrice: { type: Number },
    medium: { type: String, default: "Oil" },
    style: { type: String, default: "Contemporary" },
    dimensions: {
        height: { type: Number, default: 24 },
        width: { type: Number, default: 36 },
        depth: { type: Number, default: 0 },
        unit: { type: String, enum: ['in', 'cm'], default: 'in' }
    },
    orientation: { type: String, enum: ['portrait', 'landscape', 'square'], default: 'portrait' },
    colors: [{ type: String }],
    inventoryStatus: { type: String, enum: ['available', 'reserved', 'sold'], default: 'available' },
    averageRating: { type: Number, default: 0 }
}, { timestamps: true });

sellerPostSchema.index({ category: 1, price: 1, style: 1, inventoryStatus: 1 });
sellerPostSchema.index({ title: 'text', description: 'text', medium: 'text' });

const SellerPost = mongoose.model('SellerPost', sellerPostSchema);

module.exports = SellerPost;