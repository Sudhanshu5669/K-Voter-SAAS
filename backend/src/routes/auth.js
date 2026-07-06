import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

/**
 * GET /api/auth/config
 * Exposes public Supabase and Buy Me a Coffee parameters for client-side configuration
 */
router.get('/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    bmcMembershipUrl: process.env.BMC_MEMBERSHIP_URL
  });
});

/**
 * GET /api/auth/me
 * Retrieves current user metadata and subscription details
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user details from our database table (users)
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) {
      // If profile does not exist yet (first-time login), we can auto-create it or return a default
      if (profileError.code === 'PGRST116') {
        const metadata = req.user.user_metadata || {};
        const { data: newProfile, error: createError } = await supabaseAdmin
          .from('users')
          .insert({
            id: userId,
            discord_username: metadata.full_name || metadata.custom_claims?.global_name || 'Discord User',
            email: req.user.email,
            subscription_status: 'inactive'
          })
          .select()
          .single();

        if (createError) throw createError;
        return res.json({ user: req.user, profile: newProfile });
      }
      throw profileError;
    }

    res.json({
      user: req.user,
      profile: userProfile
    });
  } catch (err) {
    console.error('Error fetching auth state:', err.message);
    res.status(500).json({ error: 'Failed to fetch user state' });
  }
});

/**
 * POST /api/auth/logout
 * Logs the user out of the backend (token revocation)
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    // Supabase handles logout primarily on the client, 
    // but we return success here to let the frontend know the API session is closed.
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

export default router;
