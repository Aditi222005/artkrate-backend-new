const mongoose = require('mongoose');

const artistPortfolioSchema = new mongoose.Schema({
  artistId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true, unique: true },
  achievements: [{ type: String }],
  exhibitions: [{
    title: { type: String, required: true },
    gallery: { type: String, required: true },
    year: { type: Number, required: true }
  }],
  awards: [{ type: String }],
  certifications: [{ type: String }],
  featuredWorks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SellerPost' }],
  socialLinks: {
    instagram: { type: String },
    website: { type: String },
    behance: { type: String }
  },
  views: { type: Number, default: 0 },
  conversionRate: { type: Number, default: 0.0 }
}, { timestamps: true });

module.exports = mongoose.model('ArtistPortfolio', artistPortfolioSchema);
