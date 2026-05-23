import pool from '../config/db.js';
import { createPaymentIntent as createStripePaymentIntent } from '../services/stripeService.js';

export async function createPaymentIntent(req, res) {
  try {
    const user = req.user;
    const { booking_id, plantation_id, amount, currency, payment_method } = req.body;

    if (!booking_id || !plantation_id || !amount || !currency) {
      return res.status(400).json({ error: 'booking_id, plantation_id, amount, and currency are required.' });
    }

    const paymentReference = `PAY-${Date.now().toString(36).toUpperCase()}`;
    const paymentIntent = await createStripePaymentIntent({ amount, currency, metadata: { booking_id, plantation_id } });

    const insertQuery = `
      INSERT INTO payments (
        payment_reference,
        booking_id,
        plantation_id,
        amount,
        currency,
        status,
        payment_method,
        transaction_id,
        payment_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `;

    const values = [
      paymentReference,
      booking_id,
      plantation_id,
      amount,
      currency,
      'pending',
      payment_method || 'card',
      paymentIntent.id,
      null,
    ];

    const { rows } = await pool.query(insertQuery, values);
    return res.status(201).json({ data: rows[0], client_secret: paymentIntent.client_secret });
  } catch (error) {
    console.error('createPaymentIntent error:', error);
    return res.status(500).json({ error: 'Failed to create payment intent.' });
  }
}

export async function getPayments(req, res) {
  try {
    const user = req.user;
    let query = '';
    let values = [];

    if (user.role === 'superadmin') {
      query = 'SELECT * FROM payments ORDER BY created_at DESC';
    } else if (user.role === 'plantationadmin') {
      query = 'SELECT * FROM payments WHERE plantation_id = $1 ORDER BY created_at DESC';
      values = [user.plantation_id];
    } else {
      query = `
        SELECT pay.*
        FROM payments pay
        LEFT JOIN bookings b ON b.id = pay.booking_id
        WHERE b.tourist_id = $1
        ORDER BY pay.created_at DESC
      `;
      values = [user.id];
    }

    const { rows } = await pool.query(query, values);
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('getPayments error:', error);
    return res.status(500).json({ error: 'Failed to fetch payments.' });
  }
}

export async function updatePaymentStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (!id || !status) {
    return res.status(400).json({ error: 'Payment id and status are required.' });
  }

  try {
    const { rows } = await pool.query('UPDATE payments SET status = $1, updated_at = now() WHERE id = $2 RETURNING *', [status, id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Payment not found.' });
    }
    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('updatePaymentStatus error:', error);
    return res.status(500).json({ error: 'Failed to update payment status.' });
  }
}
