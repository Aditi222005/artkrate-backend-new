const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const connectDB = async () => {
    if (mongoose.connection.readyState === 1) {
        console.log("MongoDB is already connected.");
        return;
    }
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected successfully");
    } catch (error) {
        console.log("MongoDB connection failed :", error.message);
    }
};

module.exports = connectDB;