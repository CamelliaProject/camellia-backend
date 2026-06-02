import pool from '../config/db.js';
import crypto from 'crypto';
import { createPaymentIntent as createStripePaymentIntent } from '../services/stripeService.js';
import { generateHash, getCheckoutUrl, verifyNotify } from '../services/payhereService.js';
import { sendBookingConfirmationEmail } from '../services/emailService.js';

function generateBookingReference() {
  return `BK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex')}`;
}

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

// ── PayHere: create booking + return checkout params ──────────────────────
export async function initiatePayHere(req, res) {
  try {
    const user = req.user;
    const {
      plantation_id,
      booking_date,
      num_adults,
      num_children,
      total_price_usd,
      total_price_lkr,
      tourist_full_name,
      tourist_email,
      tourist_phone,
      tourist_country,
      special_notes,
      experience_ids,
      // PayHere-specific
      currency,     // 'LKR' | 'USD'
      amount,       // numeric total
      first_name,
      last_name,
      address,
      city,
    } = req.body;

    if (!plantation_id || !booking_date || !tourist_full_name || !tourist_email || !amount || !currency) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const merchantId     = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const frontendUrl    = process.env.FRONTEND_URL || 'http://localhost:5173';
    const backendUrl     = process.env.BACKEND_URL  || 'http://localhost:5000';

    if (!merchantId || !merchantSecret) {
      return res.status(500).json({ error: 'PayHere is not configured on the server.' });
    }

    // Create booking
    const bookingReference = generateBookingReference();
    const { rows } = await pool.query(
      `INSERT INTO bookings (
        booking_reference, plantation_id, tourist_id, booking_date,
        num_adults, num_children, total_price_usd, total_price_lkr,
        tourist_full_name, tourist_email, tourist_phone, tourist_country, special_notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        bookingReference, plantation_id, user.id, booking_date,
        num_adults || 1, num_children || 0,
        total_price_usd || null, total_price_lkr || null,
        tourist_full_name, tourist_email,
        tourist_phone || null, tourist_country || null, special_notes || null,
      ]
    );
    const booking = rows[0];

    if (Array.isArray(experience_ids) && experience_ids.length) {
      for (const experienceId of experience_ids) {
        await pool.query(
          `INSERT INTO booking_experiences (booking_id, experience_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [booking.id, experienceId]
        );
      }
    }

    const hash = generateHash(merchantId, bookingReference, amount, currency, merchantSecret);

    return res.status(201).json({
      booking_reference: bookingReference,
      checkout_url: getCheckoutUrl(),
      params: {
        merchant_id:  merchantId,
        return_url:   `${frontendUrl}/payment-return`,
        cancel_url:   `${frontendUrl}/payment-return?cancelled=true`,
        notify_url:   `${backendUrl}/api/payments/payhere/notify`,
        order_id:     bookingReference,
        items:        'Plantation Experience Booking',
        currency,
        amount:       Number(amount).toFixed(2),
        first_name:   first_name || tourist_full_name.split(' ')[0],
        last_name:    last_name  || tourist_full_name.split(' ').slice(1).join(' ') || '-',
        email:        tourist_email,
        phone:        tourist_phone || '',
        address:      address || '',
        city:         city    || '',
        country:      tourist_country || 'Sri Lanka',
        hash,
      },
    });
  } catch (error) {
    console.error('initiatePayHere error:', error);
    return res.status(500).json({ error: 'Failed to initiate payment.' });
  }
}

// ── PayHere server-to-server notification ─────────────────────────────────
export async function payhereNotify(req, res) {
  try {
    const params = req.body;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

    if (!merchantSecret) {
      console.error('payhereNotify: PAYHERE_MERCHANT_SECRET not set');
      return res.sendStatus(400);
    }

    if (!verifyNotify(params, merchantSecret)) {
      console.warn('payhereNotify: invalid signature', params);
      return res.sendStatus(400);
    }

    const { order_id, payment_id, status_code } = params;
    // status_code: 2 = success, 0 = pending, -1 = cancelled, -2 = failed
    const bookingStatus =
      status_code === '2'  ? 'upcoming'  :
      status_code === '0'  ? 'upcoming'  :
      status_code === '-1' ? 'cancelled' :
                             'cancelled';

    await pool.query(
      `UPDATE bookings
       SET status = $1, payhere_payment_id = COALESCE($2, payhere_payment_id), updated_at = now()
       WHERE booking_reference = $3`,
      [bookingStatus, payment_id || null, order_id]
    );

    return res.sendStatus(200);
  } catch (error) {
    console.error('payhereNotify error:', error);
    return res.sendStatus(500);
  }
}

// ── Save PayHere payment_id from return URL (fallback for localhost dev) ──
export async function savePayHerePayment(req, res) {
  try {
    const user = req.user;
    const { booking_reference, payment_id } = req.body;

    if (!booking_reference || !payment_id) {
      return res.status(400).json({ error: 'booking_reference and payment_id are required.' });
    }

    // Only update if this booking belongs to the authenticated tourist
    const { rows: updated } = await pool.query(
      `UPDATE bookings
       SET payhere_payment_id = $1, updated_at = now()
       WHERE booking_reference = $2 AND tourist_id = $3
       RETURNING *`,
      [payment_id, booking_reference, user.id]
    );

    // Send confirmation email fire-and-forget
    if (updated.length && updated[0].tourist_email) {
      const booking = updated[0];
      const { rows: expRows } = await pool.query(
        `SELECT e.name FROM booking_experiences be
         JOIN experiences e ON e.id = be.experience_id
         WHERE be.booking_id = $1`,
        [booking.id]
      );
      sendBookingConfirmationEmail(
        booking.tourist_email,
        booking.tourist_full_name || 'Valued Guest',
        booking,
        expRows.map(r => r.name)
      ).catch(err => console.error('Booking confirmation email failed:', err.message));
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('savePayHerePayment error:', error);
    return res.status(500).json({ error: 'Failed to save payment id.' });
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
