import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';
import { executeVoteCron } from './cron.js';

const router = express.Router();

// Enforce auth and admin privileges on all admin endpoints
router.use(requireAuth);
router.use(requireAdmin);

/**
 * GET /api/admin/status
 * Verifies admin rights
 */
router.get('/status', (req, res) => {
  res.json({ success: true, is_admin: true });
});

/**
 * GET /api/admin/users
 * Returns list of all registered users
 */
router.get('/users', async (req, res) => {
  try {
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, discord_username, email, subscription_status, encrypted_token, last_vote_at, last_vote_result, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ users });
  } catch (err) {
    console.error('[ADMIN] Get users error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve registered users.' });
  }
});

/**
 * POST /api/admin/users/:id/toggle-approval
 * Toggles a user's approval status (subscription_status active/inactive)
 */
router.post('/users/:id/toggle-approval', async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Fetch current status
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('subscription_status')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;

    const newStatus = user.subscription_status === 'active' ? 'inactive' : 'active';

    // Update status
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        subscription_status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: `User status changed to ${newStatus === 'active' ? 'APPROVED' : 'INACTIVE'} successfully.`,
      status: newStatus
    });
  } catch (err) {
    console.error('[ADMIN] Toggle approval error:', err.message);
    res.status(500).json({ error: 'Failed to change user status.' });
  }
});

/**
 * POST /api/admin/trigger-cron
 * Manually executes the voter cron flow immediately
 */
router.post('/trigger-cron', async (req, res) => {
  try {
    console.log('[ADMIN] Manual cron execution triggered by admin.');
    const results = await executeVoteCron();
    res.json({
      success: true,
      message: 'Vote cron executed successfully',
      results
    });
  } catch (err) {
    console.error('[ADMIN] Manual cron trigger error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
