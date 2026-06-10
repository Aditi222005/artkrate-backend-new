const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const connectDB = require('./DB/db');
// ─── Route Imports ────────────────────────────────────────────────────────────
const userRoutes = require('./routes/user.routes');
const adminRoutes = require('./routes/admin.routes');
const sellerPostRoutes = require('./routes/sellerPost.routes');
const sellerProfileRoutes = require('./routes/sellerProfile.routes');
const followRoutes = require('./routes/follow.routes');
const cartRoutes = require('./routes/cart.routes');
const artworkRoutes = require('./routes/artwork.routes');
const orderRoutes = require('./routes/order.routes');
const paymentRoutes = require('./routes/payment.routes');
const activityRoutes = require('./routes/activity.routes');
const sellerRoutes = require('./routes/seller.routes');
const aiRoutes = require('./routes/ai.routes');
const messageRoutes = require('./routes/message.routes');
const { initRedis } = require('./utils/redisClient');

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https://*.googleusercontent.com'],
        connectSrc: ["'self'", 'https://checkout.razorpay.com'],
        scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
        frameSrc: ["'self'", 'https://api.razorpay.com'],
      },
    },
  })
);

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
  skip: (req) => req.path === '/health',
});

const authLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 20,
  message: { message: 'Too many login attempts. Please try again in 30 seconds.' },
});

app.use(globalLimiter);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:5174',
  'http://localhost:8081',
  'http://localhost:8082',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests from localhost, custom Client URL, or any Vercel deployments
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app')
      ) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// ─── Logging ──────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ─── Body Parsing ─────────────────────────────────────────────────────────────
// IMPORTANT: Raw body for Razorpay webhooks MUST come before express.json()
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());


// ─── Database ─────────────────────────────────────────────────────────────────
// Connect Database & Services
connectDB();
initRedis();
// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', authLimiter, userRoutes);        // Auth: login, signup, logout, /me
app.use('/api', adminRoutes);
app.use('/api/sellerpost', sellerPostRoutes);
app.use('/api/sellerprofile', sellerProfileRoutes);
app.use('/api/follow', followRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/artwork', artworkRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/payment', paymentRoutes);          // Razorpay payment + webhook
app.use('/api/activity', activityRoutes);        // User activity feed
app.use('/api/seller', sellerRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/messages', messageRoutes);

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── Health Check (used by Docker Compose healthcheck) ───────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});


// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Don't log CORS errors verbosely in production
  if (err.message?.startsWith('CORS blocked')) {
    return res.status(403).json({ message: err.message });
  }

  console.error('Unhandled error:', err.message || err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 ArtKrate server running at http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;