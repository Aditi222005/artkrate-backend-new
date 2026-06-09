const express = require('express');
const router = express.Router();
const SellerVerification = require('../models/sellerVerification.model');
const User = require('../models/user.model');
const auth = require('../middlewares/auth');

// GET /api/seller/get-seller-id/:userId
router.get('/get-seller-id/:userId', async (req, res) => {
  try {
    const sellerDoc = await SellerVerification.findOne({ sellerId: req.params.userId });

    if (!sellerDoc) return res.status(404).json({ message: 'Seller verification document not found' });

    res.status(200).json({ sellerId: sellerDoc._id, status: sellerDoc.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/seller/verify (Automated Mock KYC Submission)
router.post('/verify', auth, async (req, res) => {
  try {
    const { documentType, documentNumber } = req.body;
    if (!documentType || !documentNumber) {
      return res.status(400).json({ message: 'Document type and document number are required.' });
    }

    // Check if verification record already exists
    let verification = await SellerVerification.findOne({ sellerId: req.user.id });
    if (verification && verification.status === 'verified') {
      return res.status(400).json({ message: 'Account is already verified as seller.' });
    }

    if (!verification) {
      verification = new SellerVerification({
        sellerId: req.user.id,
        documentType,
        documentNumber,
        documentFile: req.body.documentFile || 'mock-document-url.pdf',
      });
    } else {
      verification.documentType = documentType;
      verification.documentNumber = documentNumber;
      verification.status = 'pending';
    }

    // Mock automatic processing: Set to verified instantly and update User.userType
    verification.status = 'verified';
    verification.remarks = 'Automated KYC verification approved successfully.';
    verification.reviewedAt = new Date();
    await verification.save();

    // Promote user to seller role
    await User.findByIdAndUpdate(req.user.id, { userType: 'seller' });

    res.status(200).json({
      message: 'KYC Verification auto-approved! Account upgraded to Seller.',
      verification
    });
  } catch (err) {
    console.error('Error in mock KYC verification:', err);
    res.status(500).json({ message: 'Verification processing failed.' });
  }
});

module.exports = router;
