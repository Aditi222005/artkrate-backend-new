const mongoose = require('mongoose');

const contestSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  prizeDetails: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  entries: [{
    artistId: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
    artworkId: { type: mongoose.Schema.Types.ObjectId, ref: 'SellerPost' },
    votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'users' }]
  }]
}, { timestamps: true });

module.exports = mongoose.model('Contest', contestSchema);
