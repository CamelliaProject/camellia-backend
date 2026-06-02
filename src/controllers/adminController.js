import pool from '../config/db.js';
import { sendBookingCancellationEmail } from '../services/emailService.js';
import { processRefund } from '../services/payhereService.js';

export async function getPlantationBookings(req, res) {
  const { plantationId } = req.params;
  if (!plantationId) return res.status(400).json({ error: 'Missing plantation id parameter.' });

  try {
    const { rows } = await pool.query(
      `SELECT b.*, b.cancelled_by,
              u.username AS tourist_username,
              COALESCE(
                json_agg(e.name ORDER BY e.name) FILTER (WHERE e.name IS NOT NULL),
                '[]'
              ) AS experience_names
       FROM bookings b
       LEFT JOIN users u ON u.id = b.tourist_id
       LEFT JOIN booking_experiences be ON be.booking_id = b.id
       LEFT JOIN experiences e ON e.id = be.experience_id
       WHERE b.plantation_id = $1
       GROUP BY b.id, u.username
       ORDER BY b.created_at DESC`,
      [plantationId]
    );

    return res.status(200).json({ bookings: rows });
  } catch (error) {
    console.error('getPlantationBookings error:', error);
    return res.status(500).json({ error: 'Failed to fetch plantation bookings.' });
  }
}

export async function updateBookingStatus(req, res) {
  const { bookingId } = req.params;
  const { status, reason } = req.body;

  if (!bookingId || !status) {
    return res.status(400).json({ error: 'Booking id and status are required.' });
  }

  try {
    // Fetch the existing booking first
    const { rows: existing } = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
    if (!existing.length) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    const booking = existing[0];

    // Enforce 7-day rule for admin cancellations
    if (status === 'cancelled') {
      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'A cancellation reason is required.' });
      }
      if (booking.booking_date) {
        const bookingDay = new Date(booking.booking_date);
        bookingDay.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntil = Math.round((bookingDay - today) / (1000 * 60 * 60 * 24));
        if (daysUntil < 7) {
          return res.status(400).json({
            error: `Cancellations must be made at least 7 days before the booking date. This booking is ${daysUntil} day${daysUntil === 1 ? '' : 's'} away.`,
          });
        }
      }
    }

    const cancelledBy = status === 'cancelled' ? 'admin' : null;
    const { rows } = await pool.query(
      `UPDATE bookings
       SET status = $1,
           cancelled_by = CASE WHEN $1 = 'cancelled' THEN 'admin' ELSE cancelled_by END,
           updated_at = now()
       WHERE id = $2 RETURNING *`,
      [status, bookingId]
    );

    if (status === 'cancelled') {
      const contactEmail = process.env.CONTACT_EMAIL || process.env.EMAIL_USER || 'support@camellia.com';

      // Fire-and-forget: issue PayHere refund if a payment_id is stored
      if (booking.payhere_payment_id) {
        processRefund(
          booking.payhere_payment_id,
          `Booking ${booking.booking_reference} cancelled by plantation: ${reason.trim()}`
        ).catch(err => console.error('PayHere refund error:', err.message));
      }

      // Fire-and-forget: send cancellation email to tourist
      if (booking.tourist_email) {
        sendBookingCancellationEmail(
          booking.tourist_email,
          booking.tourist_full_name || 'Valued Guest',
          booking,
          reason.trim(),
          contactEmail
        ).catch(err => console.error('Failed to send cancellation email:', err));
      }
    }

    return res.status(200).json({ booking: rows[0] });
  } catch (error) {
    console.error('updateBookingStatus error:', error);
    return res.status(500).json({ error: 'Failed to update booking status.' });
  }
}

export async function getPlantationPayments(req, res) {
  const { plantationId } = req.params;
  if (!plantationId) return res.status(400).json({ error: 'Missing plantation id parameter.' });

  try {
    const { rows } = await pool.query(
      `SELECT b.id,
              b.booking_reference,
              b.tourist_full_name,
              b.tourist_email,
              b.total_price_usd,
              b.total_price_lkr,
              b.num_adults,
              b.num_children,
              b.status,
              b.booking_date,
              b.created_at,
              COALESCE(
                json_agg(e.name ORDER BY e.name) FILTER (WHERE e.name IS NOT NULL),
                '[]'
              ) AS experience_names
       FROM bookings b
       LEFT JOIN booking_experiences be ON be.booking_id = b.id
       LEFT JOIN experiences e ON e.id = be.experience_id
       WHERE b.plantation_id = $1
         AND (b.status <> 'cancelled' OR b.cancelled_by = 'tourist')
       GROUP BY b.id
       ORDER BY b.created_at DESC`,
      [plantationId]
    );

    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('getPlantationPayments error:', error);
    return res.status(500).json({ error: 'Failed to fetch plantation payments.' });
  }
}

export async function getPlantationReviews(req, res) {
  const { plantationId } = req.params;
  if (!plantationId) return res.status(400).json({ error: 'Missing plantation id parameter.' });

  try {
    const reviewsResult = await pool.query(
      `SELECT r.*, u.username AS tourist_username, u.email AS tourist_email
       FROM reviews r
       LEFT JOIN users u ON u.id = r.tourist_id
       WHERE r.plantation_id = $1
       ORDER BY r.created_at DESC`,
      [plantationId]
    );

    return res.status(200).json({ reviews: reviewsResult.rows });
  } catch (error) {
    console.error('getPlantationReviews error:', error);
    return res.status(500).json({ error: 'Failed to fetch plantation reviews.' });
  }
}

export async function addReviewReply(req, res) {
  const { reviewId } = req.params;
  const { text } = req.body;
  const user = req.user;

  if (!reviewId || !text) {
    return res.status(400).json({ error: 'Review id and reply text are required.' });
  }

  try {
    const authorName = user.username || user.name || user.email || 'Plantation Admin';
    const { rows } = await pool.query(
      `INSERT INTO review_replies (review_id, plantation_admin_id, author_name, content, is_verified)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [reviewId, user.id, authorName, text, false]
    );

    return res.status(201).json({ reply: rows[0] });
  } catch (error) {
    console.error('addReviewReply error:', error);
    return res.status(500).json({ error: 'Failed to add review reply.' });
  }
}
