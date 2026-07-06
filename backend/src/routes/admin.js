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
 * Verifies admin rights (used by frontend to show/hide admin nav link)
 */
router.get('/status', (req, res) => {
  res.json({ success: true, is_admin: true });
});

/**
 * GET /api/admin/stats
 * Returns aggregate stats for the admin dashboard stats bar
 */
router.get('/stats', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsersRes,
      activeUsersRes,
      votesTodayRes,
      totalVotesRes
    ] = await Promise.all([
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('subscription_status', 'active'),
      supabaseAdmin.from('vote_logs').select('id', { count: 'exact', head: true })
        .eq('status', 'success')
        .gte('voted_at', todayStart.toISOString()),
      supabaseAdmin.from('vote_logs').select('id', { count: 'exact', head: true }).eq('status', 'success')
    ]);

    const totalUsers = totalUsersRes.count || 0;
    const activeUsers = activeUsersRes.count || 0;

    res.json({
      total_users: totalUsers,
      active_users: activeUsers,
      pending_users: totalUsers - activeUsers,
      votes_today: votesTodayRes.count || 0,
      total_votes: totalVotesRes.count || 0
    });
  } catch (err) {
    console.error('[ADMIN] Stats error:', err.message);
    res.status(500).json({ error: 'Failed to load stats.' });
  }
});

/**
 * GET /api/admin/users
 * Returns list of all registered users (includes approved_until)
 */
router.get('/users', async (req, res) => {
  try {
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, discord_username, email, subscription_status, encrypted_token, last_vote_at, last_vote_result, approved_until, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ users });
  } catch (err) {
    console.error('[ADMIN] Get users error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve registered users.' });
  }
});

/**
 * POST /api/admin/users/:id/approve
 * Approves a user for 30 days from now
 */
router.post('/users/:id/approve', async (req, res) => {
  try {
    const userId = req.params.id;
    const approvedUntil = new Date();
    approvedUntil.setDate(approvedUntil.getDate() + 30);

    const { error } = await supabaseAdmin
      .from('users')
      .update({
        subscription_status: 'active',
        approved_until: approvedUntil.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'User approved for 30 days.',
      approved_until: approvedUntil.toISOString()
    });
  } catch (err) {
    console.error('[ADMIN] Approve user error:', err.message);
    res.status(500).json({ error: 'Failed to approve user.' });
  }
});

/**
 * POST /api/admin/users/:id/disable
 * Immediately disables a user and clears their approval window
 */
router.post('/users/:id/disable', async (req, res) => {
  try {
    const userId = req.params.id;

    const { error } = await supabaseAdmin
      .from('users')
      .update({
        subscription_status: 'inactive',
        approved_until: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) throw error;

    res.json({ success: true, message: 'User disabled successfully.' });
  } catch (err) {
    console.error('[ADMIN] Disable user error:', err.message);
    res.status(500).json({ error: 'Failed to disable user.' });
  }
});

/**
 * POST /api/admin/users/:id/toggle-approval
 * Legacy toggle endpoint (kept for backward compatibility).
 * Now also sets/clears approved_until when toggling.
 */
router.post('/users/:id/toggle-approval', async (req, res) => {
  try {
    const userId = req.params.id;

    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('subscription_status')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;

    const newStatus = user.subscription_status === 'active' ? 'inactive' : 'active';
    const approvedUntil = newStatus === 'active'
      ? (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString(); })()
      : null;

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        subscription_status: newStatus,
        approved_until: approvedUntil,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: `User status changed to ${newStatus === 'active' ? 'APPROVED (30 days)' : 'INACTIVE'} successfully.`,
      status: newStatus
    });
  } catch (err) {
    console.error('[ADMIN] Toggle approval error:', err.message);
    res.status(500).json({ error: 'Failed to change user status.' });
  }
});

/**
 * POST /api/admin/trigger-cron
 * Manually executes the voter cron function directly on the server
 */
router.post('/trigger-cron', async (req, res) => {
  try {
    console.log('[ADMIN] Manual internal cron execution triggered by admin.');
    const results = await executeVoteCron();
    res.json({
      success: true,
      message: 'Vote cron executed successfully',
      results
    });
  } catch (err) {
    console.error('[ADMIN] Manual cron trigger error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/admin/trigger-github-action
 * Dispatches the vote-cron GitHub Actions workflow via the GitHub REST API.
 * Requires GITHUB_PAT, GITHUB_REPO env vars.
 * Optional: GITHUB_WORKFLOW_ID (defaults to 'vote-cron.yml'), GITHUB_BRANCH (defaults to 'main')
 */
router.post('/trigger-github-action', async (req, res) => {
  try {
    const githubPat = process.env.GITHUB_PAT;
    const githubRepo = process.env.GITHUB_REPO; // e.g. "Sudhanshu5669/k-voter-saas"
    const workflowId = process.env.GITHUB_WORKFLOW_ID || 'vote-cron.yml';
    const ref = process.env.GITHUB_BRANCH || 'main';

    if (!githubPat || !githubRepo) {
      return res.status(500).json({
        error: 'GitHub credentials not configured. Set GITHUB_PAT and GITHUB_REPO in your environment variables.'
      });
    }

    const apiUrl = `https://api.github.com/repos/${githubRepo}/actions/workflows/${workflowId}/dispatches`;
    console.log(`[ADMIN] Dispatching GitHub Actions workflow: ${apiUrl} (ref: ${ref})`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubPat}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ref })
    });

    if (response.status === 204) {
      console.log('[ADMIN] GitHub Actions workflow dispatched successfully.');
      res.json({
        success: true,
        message: `GitHub Actions workflow "${workflowId}" dispatched on branch "${ref}". Check your Actions tab for progress.`
      });
    } else {
      const body = await response.text();
      console.error('[ADMIN] GitHub API error:', response.status, body);
      res.status(response.status).json({
        error: `GitHub API returned ${response.status}: ${body}`
      });
    }
  } catch (err) {
    console.error('[ADMIN] Trigger GitHub Action error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
