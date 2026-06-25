import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { encrypt } from '../services/encryption.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

/**
 * POST /api/user/token
 * Encrypts and stores the user's Top.gg session cookie
 */
router.post('/token', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token || typeof token !== 'string' || token.trim() === '') {
      return res.status(400).json({ error: 'A valid Top.gg session token is required.' });
    }

    // Encrypt the token using AES-256-GCM
    const encrypted = encrypt(token.trim());

    // Save encryption payload to user record
    const { error } = await supabaseAdmin
      .from('users')
      .update({
        encrypted_token: encrypted.encryptedText,
        token_iv: encrypted.iv,
        token_tag: encrypted.tag,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;

    res.json({ success: true, message: 'Token saved and encrypted successfully.' });
  } catch (err) {
    console.error('Save token error:', err.message);
    res.status(500).json({ error: 'Failed to save Top.gg session token.' });
  }
});

/**
 * GET /api/user/status
 * Returns subscription, token config, and last vote execution results
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('subscription_status, last_vote_at, last_vote_result, encrypted_token')
      .eq('id', userId)
      .single();

    if (error) throw error;

    res.json({
      subscription_status: user.subscription_status || 'inactive',
      last_vote_at: user.last_vote_at,
      last_vote_result: user.last_vote_result,
      has_token: !!user.encrypted_token
    });
  } catch (err) {
    console.error('Get status error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve user configuration status.' });
  }
});

/**
 * GET /api/user/logs
 * Retrieves the last 25 vote results for this user
 */
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: logs, error } = await supabaseAdmin
      .from('vote_logs')
      .select('id, status, detail, voted_at')
      .eq('user_id', userId)
      .order('voted_at', { ascending: false })
      .limit(25);

    if (error) throw error;

    res.json({ logs });
  } catch (err) {
    console.error('Get vote logs error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve voting logs.' });
  }
});

export default router;
