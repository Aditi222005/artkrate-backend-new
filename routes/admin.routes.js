const express  = require('express');
const router   = express.Router();
const Admin    = require('../models/admin.models.js');
const SellerVerification = require('../models/sellerVerification.model.js');
const User     = require('../models/user.model.js');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const dotenv   = require('dotenv');
const verifyAdminToken = require('../middlewares/verifyAdminToken.js');

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/login
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required.' });

    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(401).json({ message: 'Invalid email or password.' });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid email or password.' });

    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: 'admin' },
      process.env.JWT_SECRET || 'default_jwt_secret',
      { expiresIn: '3d' }
    );

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('adminToken', token, {
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
      secure:   isProd,
      expires:  new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    res.status(200).json({
      message: 'Admin login successful',
      admin:   { id: admin._id, name: admin.name, email: admin.email },
      token,
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/logout
// ─────────────────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('adminToken', '', {
    httpOnly: true,
    expires: new Date(0),
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
  });
  res.status(200).json({ message: 'Admin logged out successfully' });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/dashboard-data
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard-data', verifyAdminToken, (req, res) => {
  res.status(200).json({ message: 'Welcome admin. Here is your dashboard data.' });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/verifications
// Returns full KYC data including OCR + face-match scores
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/verifications', verifyAdminToken, async (req, res) => {
  try {
    const verifications = await SellerVerification.find()
      .populate('sellerId', 'name email userType')
      .sort({ submittedAt: -1 });

    res.status(200).json(verifications);
  } catch (err) {
    console.error('Admin fetch failed:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/update-status/:id
//
// When admin APPROVES  → status:'verified', promote user to seller
// When admin REJECTS   → status:'rejected', revert user to buyer
// ─────────────────────────────────────────────────────────────────────────────
router.put('/admin/update-status/:id', verifyAdminToken, async (req, res) => {
  const { id }              = req.params;
  const { status, remarks } = req.body;

  if (!['verified', 'rejected'].includes(status)) {
    return res.status(400).json({ message: "status must be 'verified' or 'rejected'" });
  }

  try {
    const verification = await SellerVerification.findById(id);
    if (!verification)
      return res.status(404).json({ message: 'Verification not found' });

    verification.status     = status;
    verification.reviewedAt = new Date();
    if (remarks) verification.remarks = remarks;
    await verification.save();

    // ── Promote / demote user ──────────────────────────────────────────────
    const newUserType = status === 'verified' ? 'seller' : 'buyer';
    await User.findByIdAndUpdate(verification.sellerId, { userType: newUserType });

    res.status(200).json({
      message:  `Verification ${status}. User is now a ${newUserType}.`,
      sellerId: verification.sellerId,
    });
  } catch (error) {
    console.error('Status update failed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;