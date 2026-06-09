const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/user.model');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("Error: MONGO_URI is not set in backend/.env");
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(async () => {
    console.log("Connected to MongoDB Atlas.");

    const email = "testbuyer@pixora.com";
    
    // Clean up existing test buyer if any
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log(`Cleaning up existing user with email ${email}...`);
      await User.deleteOne({ _id: existingUser._id });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash("buyer123", 10);

    // Create user
    const user = new User({
      name: "Test Buyer",
      email: email,
      password: hashedPassword,
      address: "456 Gallery Boulevard",
      country: "India",
      gender: "male",
      userType: "buyer"
    });
    await user.save();
    console.log(`Created user: ${user._id} (${user.email})`);

    console.log("Test buyer account successfully seeded!");
    console.log("Credentials:");
    console.log("Email: testbuyer@pixora.com");
    console.log("Password: buyer123");
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error("MongoDB Connection/Operation Error:", err);
    process.exit(1);
  });
