import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.warn('Missing STRIPE_SECRET_KEY env variable! Stripe features will fail.');
}

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2024-04-10' // Lock in Stripe API version
});
