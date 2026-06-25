import dotenv from 'dotenv';

dotenv.config();

/**
 * Middleware to protect cron routes using CRON_SECRET
 */
export function requireCronAuth(req, res, next) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      console.error('CRITICAL: CRON_SECRET is not configured in environment variables');
      return res.status(500).json({ error: 'Server authentication configuration error' });
    }

    // Support both header formats:
    // 1. x-cron-secret: <secret>
    // 2. Authorization: Bearer <secret>
    const headerSecret = req.headers['x-cron-secret'];
    const authHeader = req.headers['authorization'];
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (headerSecret === cronSecret || token === cronSecret) {
      return next();
    }

    return res.status(401).json({ error: 'Unauthorized: Invalid cron secret' });
  } catch (err) {
    console.error('Error in cron auth middleware:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
