const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/user.model');
const SellerVerification = require('./models/sellerVerification.model');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("Error: MONGO_URI is not set in backend/.env");
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(async () => {
    console.log("Connected to MongoDB Atlas.");

    const email = "testseller@pixora.com";
    
    // Clean up existing test seller if any
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log(`Cleaning up existing user with email ${email}...`);
      await SellerVerification.deleteMany({ sellerId: existingUser._id });
      await User.deleteOne({ _id: existingUser._id });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash("seller123", 10);

    // Create user
    const user = new User({
      name: "Test Seller",
      email: email,
      password: hashedPassword,
      address: "123 Art Studio Street",
      country: "India",
      gender: "male",
      userType: "seller"
    });
    await user.save();
    console.log(`Created user: ${user._id} (${user.email})`);

    // Create verification
    const verification = new SellerVerification({
      sellerId: user._id,
      documentType: "pan",
      documentNumber: "ABCDE1234F",
      documentFront: "http://example.com/pan.jpg",
      status: "verified",
      ocrResult: {
        extractedText: "TEST SELLER ABCDE1234F",
        nameMatch: true,
        numberMatch: true,
        ocrScore: 95,
        ocrRunAt: new Date()
      },
      faceMatch: {
        score: 95,
        level: "high",
        distance: 0.1,
        matched: true,
        faceRunAt: new Date()
      },
      remarks: "Development automatic verification",
      reviewedAt: new Date()
    });
    await verification.save();
    console.log(`Created SellerVerification: ${verification._id} with status: verified`);

    console.log("Verified seller account successfully seeded!");
    console.log("Credentials:");
    console.log("Email: testseller@pixora.com");
    console.log("Password: seller123");
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error("MongoDB Connection/Operation Error:", err);
    process.exit(1);
  });
