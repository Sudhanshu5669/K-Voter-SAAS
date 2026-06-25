import express from 'express';
import { requireCronAuth } from '../middleware/cronAuth.js';
import { decrypt } from '../services/encryption.js';
import { checkVoteStatus, castVote } from '../services/voter.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET /api/cron/vote
 * Runs every 6 hours to automatically cast votes for all active paid subscribers
 */
router.get('/vote', requireCronAuth, async (req, res) => {
  console.log('[CRON] Starting automated vote execution...');
  
  try {
    // 1. Fetch all active subscribers who have configured a token
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, discord_username, encrypted_token, token_iv, token_tag')
      .eq('subscription_status', 'active')
      .not('encrypted_token', 'is', null);

    if (error) {
      throw new Error(`Database error fetching active users: ${error.message}`);
    }

    console.log(`[CRON] Found ${users.length} active subscribers to process.`);

    const results = {
      total: users.length,
      success: 0,
      already_voted: 0,
      captcha: 0,
      error: 0
    };

    // 2. Process each user sequentially with a polite delay
    for (const user of users) {
      console.log(`[CRON] Processing user: ${user.discord_username} (${user.id})`);
      
      try {
        // a. Decrypt Top.gg session token
        const token = decrypt(user.encrypted_token, user.token_iv, user.token_tag);
        if (!token) {
          throw new Error('Failed to decrypt session token');
        }

        // b. Check if user is eligible to vote (Top.gg has a 12-hour cooldown)
        const checkResult = await checkVoteStatus(token);
        
        if (checkResult.status === 'ERROR') {
          throw new Error(`Vote check failed: ${checkResult.error || 'Unknown error'}`);
        }

        if (checkResult.status === 'VOTED') {
          console.log(`[CRON] User ${user.discord_username} already voted. Cooldown: ${checkResult.timeUntilNextVote}s`);
          
          // Update last vote status
          await supabaseAdmin
            .from('users')
            .update({
              last_vote_at: new Date().toISOString(),
              last_vote_result: 'already_voted'
            })
            .eq('id', user.id);

          // Log the check
          await supabaseAdmin
            .from('vote_logs')
            .insert({
              user_id: user.id,
              status: 'already_voted',
              detail: `Cooldown remaining: ${Math.round(checkResult.timeUntilNextVote / 60)} minutes`
            });

          results.already_voted++;
        } else {
          // c. Eligible to vote, proceed to cast
          console.log(`[CRON] User ${user.discord_username} is eligible. Casting vote...`);
          
          // Wait 200ms before casting to split the check and cast
          await delay(200);
          const voteResult = await castVote(token);

          console.log(`[CRON] Vote cast result for ${user.discord_username}: ${voteResult.status} - ${voteResult.detail}`);

          // Update user last vote info
          await supabaseAdmin
            .from('users')
            .update({
              last_vote_at: voteResult.status === 'success' || voteResult.status === 'already_voted' ? new Date().toISOString() : undefined,
              last_vote_result: voteResult.status
            })
            .eq('id', user.id);

          // Log detail to logs
          await supabaseAdmin
            .from('vote_logs')
            .insert({
              user_id: user.id,
              status: voteResult.status,
              detail: voteResult.detail + (voteResult.newVoteCount ? ` (New count: ${voteResult.newVoteCount})` : '')
            });

          if (voteResult.status === 'success') results.success++;
          else if (voteResult.status === 'already_voted') results.already_voted++;
          else if (voteResult.status === 'captcha') results.captcha++;
          else results.error++;
        }

      } catch (err) {
        console.error(`[CRON] Failed to process user ${user.discord_username}:`, err.message);
        
        // Update user status to error
        await supabaseAdmin
          .from('users')
          .update({
            last_vote_result: 'error'
          })
          .eq('id', user.id);

        // Insert error log
        await supabaseAdmin
          .from('vote_logs')
          .insert({
            user_id: user.id,
            status: 'error',
            detail: err.message
          });

        results.error++;
      }

      // Add a polite 500ms delay between users to avoid rate-limiting/detection
      await delay(500);
    }

    console.log('[CRON] Automated vote execution complete. Results:', results);
    res.json({
      success: true,
      message: 'Cron job executed successfully',
      results
    });

  } catch (err) {
    console.error('[CRON] Fatal cron error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
