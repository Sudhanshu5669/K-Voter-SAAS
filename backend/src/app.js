import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import bmcRoutes from './routes/buymeacoffee.js';
import userRoutes from './routes/user.js';
import cronRoutes from './routes/cron.js';
import adminRoutes from './routes/admin.js';

const app = express();

// CORS configuration
app.use(cors((req, callback) => {
  const origin = req.header('Origin');
  const host = req.header('Host');
  const allowedUrl = process.env.FRONTEND_URL;
  
  let isAllowed = false;
  if (!origin) {
    isAllowed = true;
  } else {
    const hostOriginHttp = `http://${host}`;
    const hostOriginHttps = `https://${host}`;
    if (
      origin === hostOriginHttp ||
      origin === hostOriginHttps ||
      origin.startsWith('http://localhost') ||
      origin.endsWith('.vercel.app') ||
      (allowedUrl && origin === allowedUrl)
    ) {
      isAllowed = true;
    }
  }

  callback(null, {
    origin: isAllowed ? origin : false,
    credentials: true
  });
}));

app.use(cookieParser());

// Special body parser bypass for Buy Me a Coffee webhook to verify raw signature
app.use((req, res, next) => {
  if (req.originalUrl === '/api/buymeacoffee/webhook') {
    next(); // Skip JSON parsing, handle raw body inside buymeacoffee routes
  } else {
    express.json()(req, res, next);
  }
});

// Register api routes
app.use('/api/auth', authRoutes);
app.use('/api/buymeacoffee', bmcRoutes);
app.use('/api/user', userRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', time: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

export default app;
