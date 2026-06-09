const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const verifyToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token" });
  }

 try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log("✅ Decoded token:", decoded); // add this for debugging
  req.user = decoded;
  next();
} catch (err) {
  console.error("❌ JWT Error:", err.message);
  return res.status(401).json({ message: "Unauthorized: Invalid token" });
}
}

module.exports = { verifyToken };