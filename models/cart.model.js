const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "users", required: true },
  items: [
    {
      artworkId: { type: mongoose.Schema.Types.ObjectId, ref: "sellerposts" },
      title: String,
      image: String,
      price: Number,
      artist: String
    }
  ]
});

module.exports = mongoose.model("Cart", cartSchema);
