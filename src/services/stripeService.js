import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-08-01',
});

export async function createPaymentIntent({ amount, currency, metadata = {} }) {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable.');
  }

  const lowerCurrency = String(currency).toLowerCase();
  const amountNumber = Number(amount);
  if (Number.isNaN(amountNumber) || amountNumber <= 0) {
    throw new Error('Invalid payment amount.');
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amountNumber * 100),
    currency: lowerCurrency,
    payment_method_types: ['card'],
    metadata,
  });

  return paymentIntent;
}
