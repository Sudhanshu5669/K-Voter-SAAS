import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createCheckoutSession, createPortalSession, constructEvent } from '../services/stripeService.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = express.Router();

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout session for subscription
 */
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const email = req.user.email;

    const session = await createCheckoutSession(userId, email);
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to create checkout session' });
  }
});

/**
 * POST /api/stripe/portal
 * Creates a Stripe Customer Portal session for subscription management
 */
router.post('/portal', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user profile from DB to get Stripe customer ID
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (error || !user?.stripe_customer_id) {
      return res.status(400).json({ error: 'No active Stripe customer profile found. Please subscribe first.' });
    }

    const session = await createPortalSession(user.stripe_customer_id);
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe portal error:', err.message);
    res.status(500).json({ error: 'Failed to create billing portal session' });
  }
});

/**
 * POST /api/stripe/webhook
 * Handles incoming events from Stripe (raw body parser required)
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  let event;

  try {
    event = constructEvent(req.body, signature);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (userId && customerId) {
          // Link customer ID to user in database
          const { error } = await supabaseAdmin
            .from('users')
            .update({
              stripe_customer_id: customerId,
              subscription_id: subscriptionId,
              subscription_status: 'active' // Set active initially
            })
            .eq('id', userId);

          if (error) {
            console.error(`DB error linking stripe customer for user ${userId}:`, error.message);
          } else {
            console.log(`Successfully linked Stripe customer ${customerId} to user ${userId}`);
          }
        }
        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = subscription.status; // e.g. active, trialing

        const { error } = await supabaseAdmin
          .from('users')
          .update({
            subscription_id: subscription.id,
            subscription_status: status
          })
          .eq('stripe_customer_id', customerId);

        if (error) {
          console.error(`DB error updating subscription creation for customer ${customerId}:`, error.message);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = subscription.status; // e.g. active, past_due, canceled

        const { error } = await supabaseAdmin
          .from('users')
          .update({
            subscription_status: status
          })
          .eq('stripe_customer_id', customerId);

        if (error) {
          console.error(`DB error updating subscription update for customer ${customerId}:`, error.message);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Reset subscription details upon cancellation/deletion
        const { error } = await supabaseAdmin
          .from('users')
          .update({
            subscription_status: 'canceled',
            subscription_id: null
          })
          .eq('stripe_customer_id', customerId);

        if (error) {
          console.error(`DB error canceling subscription for customer ${customerId}:`, error.message);
        }
        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    res.status(500).json({ error: 'Internal Webhook Processing Error' });
  }
});

export default router;
