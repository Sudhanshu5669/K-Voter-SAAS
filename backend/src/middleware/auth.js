import { supabase } from '../config/supabase.js';

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
