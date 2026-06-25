import { stripe } from '../config/stripe.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create a Stripe Checkout Session for a monthly subscription
 * @param {string} userId - Supabase user ID to attach as metadata
 * @param {string} email - User's email address
 * @returns {Promise<object>} The checkout session object
 */
export async function createCheckoutSession(userId, email) {
  const priceId = process.env.STRIPE_PRICE_ID;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  if (!priceId) {
    throw new Error('STRIPE_PRICE_ID is not configured in environment variables');
  }

  return await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    mode: 'subscription',
    customer_email: email || undefined,
    success_url: `${frontendUrl}/dashboard.html?session_id={CHECKOUT_SESSION_ID}&checkout=success`,
    cancel_url: `${frontendUrl}/dashboard.html?checkout=cancel`,
    metadata: {
      supabase_user_id: userId
    },
    subscription_data: {
      metadata: {
        supabase_user_id: userId
      }
    }
  });
}

/**
 * Create a Stripe Customer Portal Session for managing subscriptions
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<object>} The customer portal session object
 */
export async function createPortalSession(customerId) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  
  return await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${frontendUrl}/dashboard.html`
  });
}

/**
 * Verify Stripe webhook signature and construct the event
 * @param {Buffer} rawBody - Raw body payload
 * @param {string} signature - Stripe signature header
 * @returns {object} The verified Stripe event
 */
export function constructEvent(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured in environment variables');
  }

  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
