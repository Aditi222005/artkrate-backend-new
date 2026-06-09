const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  category: { type: String, enum: ['Art News', 'Techniques', 'Interviews', 'Events'], required: true },
  coverImage: { type: String, required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'users' }]
}, { timestamps: true });

module.exports = mongoose.model('Blog', blogSchema);
