import pool from '../config/db.js';

export async function getPlantationBookings(req, res) {
  const { plantationId } = req.params;
  if (!plantationId) return res.status(400).json({ error: 'Missing plantation id parameter.' });

  try {
    const { rows } = await pool.query(
      `SELECT b.*,
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
  const { status } = req.body;

  if (!bookingId || !status) {
    return res.status(400).json({ error: 'Booking id and status are required.' });
  }

  try {
    const { rows } = await pool.query(
      'UPDATE bookings SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [status, bookingId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Booking not found.' });
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
         AND b.status <> 'cancelled'
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
