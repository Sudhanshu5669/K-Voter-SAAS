import express from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

/**
 * Verify Buy Me a Coffee webhook signature
 * @param {Buffer} rawBody - Raw Buffer body
 * @param {string} signature - Hex signature from x-signature-sha256 header
 * @param {string} secret - Webhook secret string
 * @returns {boolean} True if signature matches
 */
function verifyWebhook(rawBody, signature, secret) {
  if (!signature || !secret || !rawBody) return false;
  
  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    const expectedSignature = hmac.digest('hex');

    const bufferExpected = Buffer.from(expectedSignature, 'utf8');
    const bufferActual = Buffer.from(signature, 'utf8');

    if (bufferExpected.length !== bufferActual.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufferExpected, bufferActual);
  } catch (e) {
    console.error('BMC Signature verification function error:', e);
    return false;
  }
}

/**
 * POST /api/buymeacoffee/webhook
 * Handles incoming webhooks from Buy Me a Coffee (requires raw body parser)
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-signature-sha256'];
  const secret = process.env.BMC_WEBHOOK_SECRET;

  // 1. Verify Webhook Signature
  if (!verifyWebhook(req.body, signature, secret)) {
    console.error('[BUY ME A COFFEE] Webhook signature verification failed.');
    return res.status(401).send('Signature verification failed.');
  }

  try {
    const payload = JSON.parse(req.body.toString());
    const eventType = payload.event_type;
    const responseData = payload.response || {};
    const payerEmail = responseData.payer_email;
    const subscriptionId = responseData.subscription_id;

    console.log(`[BUY ME A COFFEE] Webhook received: ${eventType} for email ${payerEmail}`);

    if (!payerEmail) {
      console.warn('[BUY ME A COFFEE] Webhook payload missing payer_email');
      return res.status(200).json({ received: true, warning: 'No email found in response' });
    }

    switch (eventType) {
      case 'membership.started':
      case 'membership.updated':
      case 'membership.renewed': {
        // Find user by email and mark their subscription active
        const { data, error } = await supabaseAdmin
          .from('users')
          .update({
            subscription_id: subscriptionId ? String(subscriptionId) : null,
            subscription_status: 'active',
            updated_at: new Date().toISOString()
          })
          .eq('email', payerEmail.trim().toLowerCase())
          .select();

        if (error) {
          console.error(`[BUY ME A COFFEE] DB update error for ${payerEmail}:`, error.message);
        } else if (data && data.length > 0) {
          console.log(`[BUY ME A COFFEE] Successfully activated subscription for user: ${payerEmail}`);
        } else {
          console.warn(`[BUY ME A COFFEE] No user record found in DB for email: ${payerEmail}`);
        }
        break;
      }

      case 'membership.cancelled':
      case 'membership.ended': {
        // Mark user subscription as inactive
        const { data, error } = await supabaseAdmin
          .from('users')
          .update({
            subscription_status: 'inactive',
            subscription_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('email', payerEmail.trim().toLowerCase())
          .select();

        if (error) {
          console.error(`[BUY ME A COFFEE] DB update error during cancellation for ${payerEmail}:`, error.message);
        } else if (data && data.length > 0) {
          console.log(`[BUY ME A COFFEE] Cancelled subscription for user: ${payerEmail}`);
        } else {
          console.warn(`[BUY ME A COFFEE] No user record found in DB during cancellation for email: ${payerEmail}`);
        }
        break;
      }

      default:
        console.log(`[BUY ME A COFFEE] Unhandled event type: ${eventType}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[BUY ME A COFFEE] Error processing webhook:', err.message);
    res.status(500).json({ error: 'Internal server error processing webhook' });
  }
});

export default router;
