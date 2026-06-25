import { supabase, supabaseAdmin } from '../config/supabase.js';

/**
 * Middleware to enforce authentication using Supabase JWT
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Empty token' });
    }

    // Verify token using getUser (safest, validates on Supabase server)
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: Token is invalid or expired' });
    }

    // Attach the Supabase user details to request object
    req.user = user;
    next();
  } catch (err) {
    console.error('Error in auth middleware:', err);
    res.status(401).json({ error: 'Unauthorized' });
  }
}

/**
 * Middleware to enforce administrative privileges.
 * requireAuth must be run before this middleware.
 */
export async function requireAdmin(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Missing user session' });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminUserId = process.env.ADMIN_USER_ID;

    // 1. Check if user email or ID matches admin settings
    const isEmailAdmin = adminEmail && user.email === adminEmail;
    const isIdAdmin = adminUserId && user.id === adminUserId;

    if (isEmailAdmin || isIdAdmin) {
      return next();
    }

    // 2. Check if Discord username matches admin settings
    const adminDiscord = process.env.ADMIN_DISCORD_USERNAME;
    if (adminDiscord) {
      const { data: profile, error } = await supabaseAdmin
        .from('users')
        .select('discord_username')
        .eq('id', user.id)
        .single();

      if (!error && profile && profile.discord_username === adminDiscord) {
        return next();
      }
    }

    return res.status(403).json({ error: 'Forbidden: Administrative access required' });
  } catch (err) {
    console.error('Error in requireAdmin middleware:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
