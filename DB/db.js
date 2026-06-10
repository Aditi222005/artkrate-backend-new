const mongoose = require('mongoose');

let cachedConnection = null;

const connectDB = async () => {
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    if (!cachedConnection) {
        console.log("🔄 Initiating new MongoDB connection...");
        cachedConnection = mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000, // fail fast (5s) instead of hanging
        }).then((conn) => {
            console.log("✅ MongoDB connected successfully");
            return conn;
        }).catch((err) => {
            console.error("❌ MongoDB connection failed:", err.message);
            cachedConnection = null; // reset cache on failure
            throw err;
        });
    }

    return cachedConnection;
};

module.exports = connectDB;