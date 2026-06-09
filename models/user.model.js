const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      unique: true,
      sparse: true, // allows null while maintaining uniqueness for Google users
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      minlength: [6, 'Password must be at least 6 characters long'],
      required: function () {
        return !this.googleId; // Not required for Google OAuth users
      },
    },
    address: {
      type: String,
      trim: true,
      required: function () {
        return !this.googleId;
      },
    },
    phoneno: {
      type: String, // String to handle leading zeros and formatting
      unique: true,
      sparse: true,
    },
    userType: {
      type: String,
      required: true,
      enum: ['buyer', 'seller', 'admin'],
      default: 'buyer',
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer not to say'],
      required: function () {
        return !this.googleId;
      },
    },
    country: {
      type: String,
      trim: true,
      required: function () {
        return !this.googleId;
      },
    },
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      default: '',
    },
    profilePhoto: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'users' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'users' }],
    addresses: [{
      label: { type: String, enum: ['Home', 'Office', 'Studio', 'Other'], default: 'Home' },
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true },
      isDefault: { type: Boolean, default: false }
    }],
    paymentMethods: [{
      cardType: { type: String, enum: ['Visa', 'Mastercard', 'UPI', 'Netbanking'] },
      provider: { type: String },
      maskedDetails: { type: String },
      token: { type: String },
      isDefault: { type: Boolean, default: false }
    }],
    recentlyViewed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SellerPost' }]
  },
  { timestamps: true }
);

// Index for frequent queries on userType
userSchema.index({ userType: 1 });

const User = mongoose.model('users', userSchema);
module.exports = User;
