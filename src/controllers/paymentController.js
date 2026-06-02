import pool from '../config/db.js';
import crypto from 'crypto';
import { createPaymentIntent as createStripePaymentIntent } from '../services/stripeService.js';
import { generateHash, getCheckoutUrl, verifyNotify } from '../services/payhereService.js';
import { sendBookingConfirmationEmail, sendApprovalCredentials } from '../services/emailService.js';

function generatePassword() {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ', lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789', special = '@#$!';
  const all = upper + lower + digits + special;
  const required = [upper, lower, digits, special].map(s => s[Math.floor(Math.random() * s.length)]);
  const rest = Array.from({ length: 8 }, () => all[Math.floor(Math.random() * all.length)]);
  return [...required, ...rest].sort(() => Math.random() - 0.5).join('');
}

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

// ── Subscription: initiate PayHere checkout for plantation subscription fee ──
export async function initiateSubscription(req, res) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required.' });

    const { rows } = await pool.query(
      'SELECT * FROM plantation_requests WHERE id = $1',
      [token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Request not found.' });
    const request = rows[0];
    if (request.subscription_payment_status === 'paid') {
      return res.status(400).json({ error: 'Subscription already paid.' });
    }

    const merchantId     = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const frontendUrl    = process.env.FRONTEND_URL || 'http://localhost:5173';
    const backendUrl     = process.env.BACKEND_URL  || 'http://localhost:5000';
    const amount         = request.subscription_amount || 24000;
    const orderId        = `SUB-${token}`;

    const hash = generateHash(merchantId, orderId, amount, 'LKR', merchantSecret);

    return res.status(200).json({
      checkout_url: getCheckoutUrl(),
      params: {
        merchant_id:  merchantId,
        return_url:   `${frontendUrl}/subscription-payment-return?token=${token}`,
        cancel_url:   `${frontendUrl}/subscription-payment?token=${token}&cancelled=true`,
        notify_url:   `${backendUrl}/api/payments/subscription/notify`,
        order_id:     orderId,
        items:        `Camellia Platform Subscription`,
        currency:     'LKR',
        amount:       Number(amount).toFixed(2),
        first_name:   request.owner_name.split(' ')[0],
        last_name:    request.owner_name.split(' ').slice(1).join(' ') || '-',
        email:        request.email,
        phone:        request.telephone || '',
        address:      request.address || '',
        city:         'Sri Lanka',
        country:      'Sri Lanka',
        hash,
      },
    });
  } catch (error) {
    console.error('initiateSubscription error:', error);
    return res.status(500).json({ error: 'Failed to initiate subscription payment.' });
  }
}

// ── Subscription: called by frontend after PayHere return (localhost fallback) ─
export async function confirmSubscriptionPayment(req, res) {
  try {
    const { token, payment_id } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required.' });

    const { rows } = await pool.query(
      'SELECT * FROM plantation_requests WHERE id = $1', [token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Request not found.' });
    const request = rows[0];
    if (request.subscription_payment_status === 'paid') {
      return res.status(200).json({ ok: true, alreadyPaid: true });
    }
    if (!request.linked_plantation_id || !request.linked_admin_user_id) {
      return res.status(400).json({ error: 'Plantation not linked to this request.' });
    }

    // Generate fresh credentials
    const newPassword = generatePassword();

    // Activate plantation and update user password
    await pool.query(
      `UPDATE plantations SET is_published = true, updated_at = now() WHERE id = $1`,
      [request.linked_plantation_id]
    );
    await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
      [newPassword, request.linked_admin_user_id]
    );
    await pool.query(
      `UPDATE plantation_requests
       SET subscription_payment_status = 'paid', updated_at = now()
       WHERE id = $1`,
      [token]
    );

    // Get username for credentials email
    const { rows: userRows } = await pool.query(
      'SELECT username FROM users WHERE id = $1', [request.linked_admin_user_id]
    );
    const username = userRows[0]?.username || '';

    // Create subscription record (1 year)
    const startDate = new Date();
    const endDate   = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);
    await pool.query(
      `INSERT INTO plantation_subscriptions
         (plantation_id, plantation_request_id, subscription_type, amount, start_date, end_date, status, payhere_payment_id)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7)`,
      [request.linked_plantation_id, token,
       request.subscription_type || 'starter', request.subscription_amount || 24000,
       startDate.toISOString().slice(0,10), endDate.toISOString().slice(0,10),
       payment_id || null]
    );

    // Send credentials email
    sendApprovalCredentials(
      request.email, request.owner_name, request.name, username, newPassword
    ).catch(err => console.error('Credentials email failed:', err.message));

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('confirmSubscriptionPayment error:', error);
    return res.status(500).json({ error: 'Failed to confirm subscription payment.' });
  }
}

// ── Subscription renewal: initiate PayHere for renewal ───────────────────────
export async function initiateSubscriptionRenewal(req, res) {
  try {
    const { subscription_id } = req.body;
    if (!subscription_id) return res.status(400).json({ error: 'subscription_id is required.' });

    const { rows } = await pool.query(
      `SELECT ps.*, p.name AS plantation_name, p.email AS plantation_email,
              u.name AS owner_name, u.id AS admin_user_id
       FROM plantation_subscriptions ps
       JOIN plantations p ON p.id = ps.plantation_id
       LEFT JOIN users u ON u.plantation_id = ps.plantation_id AND u.role = 'plantationadmin'
       WHERE ps.id = $1`,
      [subscription_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Subscription not found.' });
    const sub = rows[0];

    const merchantId     = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const frontendUrl    = process.env.FRONTEND_URL || 'http://localhost:5173';
    const backendUrl     = process.env.BACKEND_URL  || 'http://localhost:5000';
    const amount         = sub.amount;
    const orderId        = `RENEW-${subscription_id}`;

    const hash = generateHash(merchantId, orderId, amount, 'LKR', merchantSecret);

    return res.status(200).json({
      checkout_url: getCheckoutUrl(),
      plantation_name: sub.plantation_name,
      subscription_type: sub.subscription_type,
      amount,
      end_date: sub.end_date,
      params: {
        merchant_id:  merchantId,
        return_url:   `${frontendUrl}/subscription-renew-return?sub=${subscription_id}`,
        cancel_url:   `${frontendUrl}/subscription-renew?sub=${subscription_id}&cancelled=true`,
        notify_url:   `${backendUrl}/api/payments/subscription-renew/notify`,
        order_id:     orderId,
        items:        'Camellia Subscription Renewal',
        currency:     'LKR',
        amount:       Number(amount).toFixed(2),
        first_name:   (sub.owner_name || 'Admin').split(' ')[0],
        last_name:    (sub.owner_name || 'Admin').split(' ').slice(1).join(' ') || '-',
        email:        sub.plantation_email,
        phone:        '',
        address:      '',
        city:         'Sri Lanka',
        country:      'Sri Lanka',
        hash,
      },
    });
  } catch (error) {
    console.error('initiateSubscriptionRenewal error:', error);
    return res.status(500).json({ error: 'Failed to initiate renewal payment.' });
  }
}

// ── Subscription renewal: confirm after PayHere return ────────────────────────
export async function confirmSubscriptionRenewal(req, res) {
  try {
    const { subscription_id, payment_id } = req.body;
    if (!subscription_id) return res.status(400).json({ error: 'subscription_id is required.' });

    const { rows } = await pool.query(
      'SELECT * FROM plantation_subscriptions WHERE id = $1', [subscription_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Subscription not found.' });
    const sub = rows[0];

    // Extend end_date by 1 year from current end_date (or today if already expired)
    const base    = new Date(sub.end_date) > new Date() ? new Date(sub.end_date) : new Date();
    const newEnd  = new Date(base);
    newEnd.setFullYear(newEnd.getFullYear() + 1);

    await pool.query(
      `UPDATE plantation_subscriptions
       SET end_date = $1, status = 'active', payhere_payment_id = COALESCE($2, payhere_payment_id),
           reminder_1month_sent = false, reminder_1week_sent = false, reminder_1day_sent = false,
           updated_at = now()
       WHERE id = $3`,
      [newEnd.toISOString().slice(0,10), payment_id || null, subscription_id]
    );

    // Re-enable plantation if it was disabled
    await pool.query(
      `UPDATE plantations SET is_disabled = false, updated_at = now() WHERE id = $1`,
      [sub.plantation_id]
    );

    return res.status(200).json({ ok: true, new_end_date: newEnd.toISOString().slice(0,10) });
  } catch (error) {
    console.error('confirmSubscriptionRenewal error:', error);
    return res.status(500).json({ error: 'Failed to confirm renewal.' });
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
