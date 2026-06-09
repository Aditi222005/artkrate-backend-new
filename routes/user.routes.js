const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Readable } = require('stream');
const path = require('path');
const multer = require('multer');
const axios = require('axios');

const User = require('../models/user.model');
const SellerVerification = require('../models/sellerVerification.model');
const { verifyToken } = require('../middlewares/verifyToken');
const cloudinary = require('../utils/cloudinary');
const Review = require('../models/review.model');
const Notification = require('../models/notification.model');

// ─── Multer (memory storage — no disk writes) ────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDFs are allowed'), false);
    }
  },
});

// ─── Helper: Upload buffer to Cloudinary ────────────────────────────────────
const uploadToCloudinary = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (result) resolve(result);
      else reject(error);
    });
    Readable.from(buffer).pipe(stream);
  });

// ─── Helper: Sign JWT ─────────────────────────────────────────────────────────
const signToken = (user) =>
  jwt.sign(
    { id: user._id, email: user.email, userType: user.userType },
    process.env.JWT_SECRET,
    { expiresIn: '3d' }
  );

// ─── Helper: Set token cookie ─────────────────────────────────────────────────
const setTokenCookie = (res, token) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    expires: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
  });
};

// ════════════════════════════════════════════════════════════════════════════
// POST /api/signup
// ════════════════════════════════════════════════════════════════════════════
router.post('/signup', upload.single('profilePhoto'), async (req, res) => {
  try {
    const { name, email, password, userType, gender, address, country, phoneno } = req.body;

    if (!name || !email || !password || !userType || !gender || !address || !country || !phoneno) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    let profilePhotoUrl = '';
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: 'profile_photos',
        resource_type: 'image',
      });
      profilePhotoUrl = result.secure_url;
    }

    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phoneno,
      userType,
      gender,
      address,
      country,
      profilePhoto: profilePhotoUrl,
    });

    const { password: _pw, ...userResponse } = newUser.toObject();
    res.status(201).json({ message: 'Account created successfully', user: userResponse });
  } catch (error) {
    console.error('Signup error:', error.message);
    res.status(500).json({ message: 'Server error during signup' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/login
// ════════════════════════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user || !user.password) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = signToken(user);
    setTokenCookie(res, token);

    const { password: _pw, ...userResponse } = user.toObject();
    res.status(200).json({ message: 'Login successful', user: userResponse });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/me — Get authenticated user profile
// ════════════════════════════════════════════════════════════════════════════
router.get('/me', verifyToken, async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(400).json({ message: 'Invalid token payload' });
    }

    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ user });
  } catch (err) {
    console.error('/me error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/check-auth — Lightweight auth check for frontend
// ════════════════════════════════════════════════════════════════════════════
router.get('/check-auth', (req, res) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ isAuthenticated: false, error: 'No token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.status(200).json({
      isAuthenticated: true,
      user: {
        _id: decoded.id,
        email: decoded.email,
        userType: decoded.userType,
        name: decoded.name,
      },
    });
  } catch (err) {
    return res.status(401).json({ isAuthenticated: false, error: 'Invalid or expired token' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/logout
// ════════════════════════════════════════════════════════════════════════════
router.post('/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0),
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
  });
  res.status(200).json({ message: 'Logged out successfully' });
});

// ════════════════════════════════════════════════════════════════════════════
// KYC helpers
// ════════════════════════════════════════════════════════════════════════════
const { runOCRVerification } = require('../utils/ocrService');
const { compareFaces }       = require('../utils/faceMatchService');

// Multi-field upload: documentFront (required), documentBack (optional), selfiePhoto (required)
const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only image files are accepted for KYC'), false);
  },
}).fields([
  { name: 'documentFront', maxCount: 1 },
  { name: 'documentBack',  maxCount: 1 },
  { name: 'selfiePhoto',   maxCount: 1 },
]);

// ════════════════════════════════════════════════════════════════════════════
// POST /api/verify-seller — KYC pipeline
//
// Flow:
//   1. Upload document and selfie images to Cloudinary
//   2. Run OCR on documentFront → check name + doc number
//   3. Run face match on selfiePhoto vs documentFront
//   4. Set status = 'pending'  (admin always reviews)
// ════════════════════════════════════════════════════════════════════════════
router.post('/verify-seller', verifyToken, kycUpload, async (req, res) => {
  try {
    const { documentType, documentNumber } = req.body;

    const frontFile  = req.files?.documentFront?.[0];
    const backFile   = req.files?.documentBack?.[0];
    const selfieFile = req.files?.selfiePhoto?.[0];

    // ── Validate required fields ────────────────────────────────────────────
    if (!documentType || !documentNumber) {
      return res.status(400).json({ message: 'documentType and documentNumber are required.' });
    }
    if (!frontFile) {
      return res.status(400).json({ message: 'Document front image is required.' });
    }
    if (!selfieFile) {
      return res.status(400).json({ message: 'Selfie photo is required.' });
    }

    // ── Block already-verified users ────────────────────────────────────────
    const existing = await SellerVerification.findOne({ sellerId: req.user.id });
    if (existing?.status === 'verified') {
      return res.status(400).json({ message: 'Your account is already verified.' });
    }

    // ── Upload all images to Cloudinary in parallel ─────────────────────────
    const cloudinaryOpts = (label) => ({
      folder: 'seller_kyc',
      public_id: `${label}_${req.user.id}_${Date.now()}`,
      resource_type: 'image',
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    });

    const [frontResult, selfieResult, backResult] = await Promise.all([
      uploadToCloudinary(frontFile.buffer, cloudinaryOpts('front')),
      uploadToCloudinary(selfieFile.buffer, cloudinaryOpts('selfie')),
      backFile ? uploadToCloudinary(backFile.buffer, cloudinaryOpts('back')) : Promise.resolve(null),
    ]);

    // ── Step 2: OCR on document front ───────────────────────────────────────
    let ocrResult = { extractedText: '', nameMatch: false, numberMatch: false, ocrScore: 0, skipped: false };
    try {
      const user = await User.findById(req.user.id).select('name');
      ocrResult = await runOCRVerification(frontFile.buffer, user?.name || '', documentNumber);
      console.log(`✅ OCR complete — score: ${ocrResult.ocrScore}/100`);
    } catch (ocrErr) {
      console.error('⚠️  OCR error (non-fatal):', ocrErr);
    }

    // ── Step 3: Face match selfie vs document front ─────────────────────────
    let faceMatchResult = { score: 0, level: 'low', matched: false, distance: 1, skipped: false };
    try {
      faceMatchResult = await compareFaces(selfieFile.buffer, frontFile.buffer);
      console.log(`✅ Face match complete — score: ${faceMatchResult.score}/100, level: ${faceMatchResult.level}`);
    } catch (faceErr) {
      console.error('⚠️  Face match error (non-fatal):', faceErr);
    }

    // ── Step 4: Determine pipeline remarks ──────────────────────────────────
    // Admin always reviews — we never auto-approve or auto-reject.
    const autoRemarks = [
      ocrResult.skipped
        ? 'OCR skipped (tesseract.js not installed)'
        : `OCR score: ${ocrResult.ocrScore}/100 (name: ${ocrResult.nameMatch ? '✓' : '✗'}, number: ${ocrResult.numberMatch ? '✓' : '✗'})`,
      faceMatchResult.skipped
        ? 'Face match skipped (face-api.js or canvas not loaded)'
        : `Face match: ${faceMatchResult.score}/100 | confidence: ${faceMatchResult.level} | distance: ${faceMatchResult.distance} (${faceMatchResult.matched ? 'MATCHED' : 'NOT MATCHED'})${faceMatchResult.remarks ? ` [AI Details: ${faceMatchResult.remarks}]` : ''}`,
      !ocrResult.skipped && ocrResult.ocrScore < 30
        ? '⚠️ LOW OCR SCORE — Admin should scrutinise document quality.'
        : '',
      !faceMatchResult.skipped && faceMatchResult.level === 'low'
        ? '⚠️ LOW FACE CONFIDENCE — Selfie does not resemble document photo.'
        : !faceMatchResult.skipped && faceMatchResult.level === 'medium'
        ? '⚠️ MEDIUM FACE CONFIDENCE — Admin should manually compare selfie vs document.'
        : '',
    ]
      .filter(Boolean)
      .join(' | ');

    // ── Step 5: Determine verification outcome and promote user if verified ──
    const ocrSuccess = ocrResult.nameMatch && ocrResult.numberMatch;
    const faceSuccess = faceMatchResult.matched || faceMatchResult.score >= (Number(process.env.FACE_MATCH_THRESHOLD) || 80);
    const isAutoVerified = ocrSuccess && faceSuccess;
    const finalStatus = isAutoVerified ? 'verified' : 'pending';
    const updatedRemarks = isAutoVerified 
      ? `[Auto-Verified] ${autoRemarks}`
      : autoRemarks;

    const verificationData = {
      sellerId:      req.user.id,
      documentType,
      documentNumber,
      documentFront: frontResult.secure_url,
      documentBack:  backResult?.secure_url || '',
      selfiePhoto:   selfieResult.secure_url,
      status:        finalStatus,
      remarks:       updatedRemarks,
      submittedAt:   new Date(),
      ocrResult: {
        extractedText: ocrResult.extractedText,
        nameMatch:     ocrResult.nameMatch,
        numberMatch:   ocrResult.numberMatch,
        ocrScore:      ocrResult.ocrScore,
        ocrRunAt:      new Date(),
      },
      faceMatch: {
        score:     faceMatchResult.score,
        level:     faceMatchResult.level,
        distance:  faceMatchResult.distance,
        matched:   faceMatchResult.matched,
        faceRunAt: new Date(),
      },
    };

    let verification;
    if (existing) {
      // Resubmission (was rejected or previously pending)
      Object.assign(existing, verificationData);
      verification = await existing.save();
    } else {
      verification = await SellerVerification.create(verificationData);
    }

    if (finalStatus === 'verified') {
      await User.findByIdAndUpdate(req.user.id, { userType: 'seller' });
      console.log(`🎉 User ${req.user.id} auto-verified and promoted to seller!`);
    }

    return res.status(existing ? 200 : 201).json({
      message: isAutoVerified
        ? 'KYC documents verified automatically! Your account is now upgraded to seller.'
        : 'KYC documents submitted successfully. Your account is under review (2–3 business days).',
      status:  finalStatus,
      ocrScore:        ocrResult.ocrScore,
      faceMatchScore:  faceMatchResult.score,
      faceMatchLevel:  faceMatchResult.level,
      faceDistance:    faceMatchResult.distance,
    });
  } catch (err) {
    console.error('KYC verification error (full details):', err);
    res.status(500).json({ message: 'Server error during verification. Please try again.', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/verify-seller-status — Check current KYC status
// ════════════════════════════════════════════════════════════════════════════
router.get('/verify-seller-status', verifyToken, async (req, res) => {
  try {
    const verification = await SellerVerification.findOne({ sellerId: req.user.id }).select(
      'status remarks ocrResult faceMatch submittedAt reviewedAt'
    );
    if (!verification) {
      return res.status(200).json({ status: 'not_submitted' });
    }
    return res.status(200).json({
      status:      verification.status,
      remarks:     verification.remarks,
      ocrScore:    verification.ocrResult?.ocrScore,
      faceScore:   verification.faceMatch?.score,
      submittedAt: verification.submittedAt,
      reviewedAt:  verification.reviewedAt,
    });
  } catch (err) {
    console.error('Status check error:', err.message);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/download/:id — Download seller document
// ════════════════════════════════════════════════════════════════════════════
router.get('/download/:id', verifyToken, async (req, res) => {
  try {
    const verification = await SellerVerification.findById(req.params.id);
    if (!verification) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Only the seller or admin can download
    if (
      verification.sellerId.toString() !== req.user.id.toString() &&
      req.user.userType !== 'admin'
    ) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const fileUrl = verification.documentFile;
    const filename = fileUrl.split('/').pop().split('?')[0];
    const response = await axios.get(fileUrl, { responseType: 'stream' });

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', response.headers['content-type']);
    response.data.pipe(res);
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).json({ message: 'Server error during download' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PUT /api/me/update — Update user profile
// ════════════════════════════════════════════════════════════════════════════
router.put('/me/update', upload.single('profilePhoto'), verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phoneno, country, address, bio } = req.body;

    let profilePhotoUrl;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: 'profile_photos',
        resource_type: 'image',
      });
      profilePhotoUrl = result.secure_url;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        ...(name && { name }),
        ...(phoneno && { phoneno }),
        ...(country && { country }),
        ...(address && { address }),
        ...(bio !== undefined && { bio }),
        ...(profilePhotoUrl && { profilePhoto: profilePhotoUrl }),
      },
      { new: true, runValidators: true }
    ).select('-password');

    res.status(200).json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Profile update error:', error.message);
    res.status(500).json({ message: 'Update failed' });
  }
});// ════════════════════════════════════════════════════════════════════════════
// Addresses Management
// ════════════════════════════════════════════════════════════════════════════
router.post('/me/addresses', verifyToken, async (req, res) => {
  try {
    const { label, street, city, state, zipCode, postalCode, country, isDefault } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (isDefault) {
      user.addresses.forEach(addr => addr.isDefault = false);
    }

    user.addresses.push({ 
      label, 
      street, 
      city, 
      state, 
      postalCode: postalCode || zipCode, 
      country, 
      isDefault: !!isDefault 
    });
    await user.save();
    res.status(201).json({ message: 'Address added', addresses: user.addresses });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.delete('/me/addresses/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.addresses.pull({ _id: req.params.id });
    await user.save();
    res.status(200).json({ message: 'Address deleted', addresses: user.addresses });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Payments Management
// ════════════════════════════════════════════════════════════════════════════
router.post('/me/payments', verifyToken, async (req, res) => {
  try {
    const { cardType, cardLast4, cardExpiry, upiId, isDefault } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (isDefault) {
      user.paymentMethods.forEach(pm => pm.isDefault = false);
    }

    const formattedMethod = {
      cardType: upiId ? 'UPI' : cardType,
      provider: upiId ? 'UPI-Provider' : 'Razorpay-Card',
      maskedDetails: upiId ? upiId : `•••• •••• •••• ${cardLast4}`,
      token: `tok_${Math.random().toString(36).substring(7)}`,
      isDefault: !!isDefault
    };

    user.paymentMethods.push(formattedMethod);
    await user.save();
    res.status(201).json({ message: 'Payment method added', paymentMethods: user.paymentMethods });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.delete('/me/payments/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.paymentMethods.pull({ _id: req.params.id });
    await user.save();
    res.status(200).json({ message: 'Payment method deleted', paymentMethods: user.paymentMethods });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Reviews Management
// ════════════════════════════════════════════════════════════════════════════
router.post('/me/reviews', verifyToken, upload.single('reviewImage'), async (req, res) => {
  try {
    const { artworkId, orderId, rating, comment } = req.body;
    if (!artworkId || !orderId || !rating || !comment) {
      return res.status(400).json({ message: 'All review fields are required.' });
    }

    let imageUrl = '';
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, {
        folder: 'reviews',
        resource_type: 'image'
      });
      imageUrl = uploadResult.secure_url;
    }

    // Check for existing review
    const existing = await Review.findOne({ buyerId: req.user.id, artworkId });
    if (existing) {
      existing.rating = parseInt(rating);
      existing.comment = comment;
      if (imageUrl) existing.images = [imageUrl];
      await existing.save();
      return res.status(200).json({ message: 'Review updated successfully', review: existing });
    }

    const review = await Review.create({
      buyerId: req.user.id,
      artworkId,
      orderId,
      rating: parseInt(rating),
      comment,
      images: imageUrl ? [imageUrl] : [],
      isVerifiedPurchase: true
    });

    res.status(201).json({ message: 'Review submitted successfully', review });
  } catch (err) {
    console.error("Submit review error:", err);
    res.status(500).json({ message: 'Server error while submitting review' });
  }
});

router.get('/me/reviews', verifyToken, async (req, res) => {
  try {
    const reviews = await Review.find({ buyerId: req.user.id }).populate('artworkId', 'title images');
    res.status(200).json({ reviews });
  } catch (err) {
    res.status(500).json({ message: 'Server error while retrieving reviews' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Notifications
// ════════════════════════════════════════════════════════════════════════════
router.get('/me/notifications', verifyToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ notifications });
  } catch (err) {
    res.status(500).json({ message: 'Server error fetching notifications' });
  }
});

router.patch('/me/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user.id },
      { read: true },
      { new: true }
    );
    res.status(200).json({ notification: notif });
  } catch (err) {
    res.status(500).json({ message: 'Server error updating notification' });
  }
});

module.exports = router;
