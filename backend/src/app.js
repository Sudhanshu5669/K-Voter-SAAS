import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import bmcRoutes from './routes/buymeacoffee.js';
import userRoutes from './routes/user.js';
import cronRoutes from './routes/cron.js';
import adminRoutes from './routes/admin.js';
import { supabaseAdmin } from './config/supabase.js';

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

// Public stats endpoint — used by landing page animated counters (no auth required)
app.get('/api/stats/public', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalVotesRes, activeUsersRes, votesTodayRes] = await Promise.all([
      supabaseAdmin.from('vote_logs').select('id', { count: 'exact', head: true }).eq('status', 'success'),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('subscription_status', 'active'),
      supabaseAdmin.from('vote_logs').select('id', { count: 'exact', head: true })
        .eq('status', 'success')
        .gte('voted_at', todayStart.toISOString())
    ]);

    res.json({
      total_votes: totalVotesRes.count || 0,
      active_users: activeUsersRes.count || 0,
      votes_today: votesTodayRes.count || 0,
      uptime: '99.9'
    });
  } catch (err) {
    // Return safe defaults on error — never expose internal errors on public endpoint
    res.json({ total_votes: 0, active_users: 0, votes_today: 0, uptime: '99.9' });
  }
});

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
