// backend/middlewares/roleMiddleware.js

module.exports = (req, res, next) => {
  const token = req.cookies.adminToken;

  if (token === "verifiedAdmin") {
    return next();
  }

  return res.status(403).json({ success: false, message: "Unauthorized admin access" });
};