import express from 'express';
import { requireCronAuth } from '../middleware/cronAuth.js';
import { decrypt } from '../services/encryption.js';
import { checkVoteStatus, castVote, castVotePlaywright } from '../services/voter.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Core cron runner executing votes for all active (approved) users.
 * Supports a 3-strike API retry followed by a Playwright browser fallback.
 * Also auto-deactivates users whose 30-day approval window has expired.
 */
export async function executeVoteCron() {
  console.log('[CRON] Starting automated vote execution...');
  
  try {
    // 1. Fetch all active users who have configured a token
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, discord_username, encrypted_token, token_iv, token_tag, approved_until')
      .eq('subscription_status', 'active')
      .not('encrypted_token', 'is', null);

    if (error) {
      throw new Error(`Database error fetching active users: ${error.message}`);
    }

    console.log(`[CRON] Found ${users.length} active users to process.`);

    const results = {
      total: users.length,
      success: 0,
      already_voted: 0,
      captcha: 0,
      error: 0,
      expired: 0
    };

    // 2. Process each user sequentially with a polite delay
    for (const user of users) {
      console.log(`[CRON] Processing user: ${user.discord_username} (${user.id})`);

      try {
        // a. Check if 30-day approval window has expired
        if (user.approved_until && new Date(user.approved_until) < new Date()) {
          console.log(`[CRON] User ${user.discord_username} approval expired on ${user.approved_until}. Auto-deactivating...`);

          await supabaseAdmin
            .from('users')
            .update({
              subscription_status: 'inactive',
              approved_until: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

          await supabaseAdmin
            .from('vote_logs')
            .insert({
              user_id: user.id,
              status: 'error',
              detail: 'Account approval period expired. Automated voting paused. Contact admin to renew.'
            });

          results.expired++;
          results.error++;
          continue; // Skip this user
        }

        // b. Decrypt Top.gg session token
        const token = decrypt(user.encrypted_token, user.token_iv, user.token_tag);
        if (!token) {
          throw new Error('Failed to decrypt session token');
        }

        // c. Check if user is eligible to vote (Top.gg has a 12-hour cooldown)
        let checkResult;
        try {
          checkResult = await checkVoteStatus(token);
          if (checkResult.status === 'ERROR') {
            console.warn(`[CRON] GraphQL status check returned ERROR for ${user.discord_username}: ${checkResult.error}. Falling back to Playwright...`);
            checkResult = { status: 'FALLBACK' };
          }
        } catch (checkErr) {
          console.warn(`[CRON] GraphQL status check threw exception for ${user.discord_username}: ${checkErr.message}. Falling back to Playwright...`);
          checkResult = { status: 'FALLBACK' };
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
          // d. Eligible to vote or fallback directly
          let voteResult = null;
          const isFallback = (checkResult.status === 'FALLBACK');

          if (!isFallback) {
            console.log(`[CRON] User ${user.discord_username} is eligible. Casting vote...`);
            let apiAttempts = 0;
            const maxApiAttempts = 3;

            while (apiAttempts < maxApiAttempts) {
              apiAttempts++;
              console.log(`[CRON] Attempt ${apiAttempts} using API method for ${user.discord_username}...`);
              
              // Wait 200ms before casting to split the check and cast
              await delay(200);
              voteResult = await castVote(token);
              
              if (voteResult.status === 'success' || voteResult.status === 'already_voted') {
                break;
              }
              if (voteResult.status === 'captcha') {
                console.log(`[CRON] Captcha required. Skipping further API retries.`);
                break;
              }
              
              // Wait 1s before retrying
              if (apiAttempts < maxApiAttempts) {
                console.log(`[CRON] API Attempt ${apiAttempts} failed: ${voteResult.detail}. Retrying in 1s...`);
                await delay(1000);
              }
            }
          } else {
            console.log(`[CRON] GraphQL check failed for ${user.discord_username}. Skipping API casting, proceeding directly to Playwright...`);
          }

          // Fallback to Playwright if API failed or if we are in fallback mode
          if (isFallback || (voteResult && voteResult.status === 'error')) {
            let pwAttempts = 0;
            const maxPwAttempts = 3;

            while (pwAttempts < maxPwAttempts) {
              pwAttempts++;
              console.log(`[CRON] Launching Playwright browser method for ${user.discord_username} (Attempt ${pwAttempts}/${maxPwAttempts})...`);
              
              try {
                voteResult = await castVotePlaywright(token);
                
                // If it is not a captcha, we don't need to retry
                if (voteResult.status !== 'captcha') {
                  break;
                }
                
                if (pwAttempts < maxPwAttempts) {
                  console.log(`[CRON] Captcha encountered. Resetting browser context and retrying in 5 seconds...`);
                  await delay(5000);
                }
              } catch (pwError) {
                console.error(`[CRON] Playwright execution failed for ${user.discord_username}:`, pwError.message);
                voteResult = {
                  status: 'error',
                  detail: `GraphQL/API failed. Playwright error: ${pwError.message}`
                };
                break; // Stop on fatal errors (e.g., Playwright not installed)
              }
            }
          }

          console.log(`[CRON] Final vote cast result for ${user.discord_username}: ${voteResult.status} - ${voteResult.detail}`);

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
    return results;

  } catch (err) {
    console.error('[CRON] Fatal cron error:', err.message);
    throw err;
  }
}

/**
 * GET /api/cron/vote
 * Endpoint triggered by external/vercel cron services
 */
router.get('/vote', requireCronAuth, async (req, res) => {
  try {
    const results = await executeVoteCron();
    res.json({
      success: true,
      message: 'Cron job executed successfully',
      results
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
