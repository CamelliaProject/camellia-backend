import pool from '../config/db.js';
import { generateBookingReference } from '../utils/generators.js';

export async function createBooking(req, res) {
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
    } = req.body;

    if (!plantation_id || !booking_date || !tourist_full_name || !tourist_email) {
      return res.status(400).json({ error: 'Missing required booking fields.' });
    }

    const bookingReference = generateBookingReference();
    const insertQuery = `
      INSERT INTO bookings (
        booking_reference,
        plantation_id,
        tourist_id,
        booking_date,
        num_adults,
        num_children,
        total_price_usd,
        total_price_lkr,
        tourist_full_name,
        tourist_email,
        tourist_phone,
        tourist_country,
        special_notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `;

    const values = [
      bookingReference,
      plantation_id,
      user.id,
      booking_date,
      num_adults || 1,
      num_children || 0,
      total_price_usd || null,
      total_price_lkr || null,
      tourist_full_name,
      tourist_email,
      tourist_phone || null,
      tourist_country || null,
      special_notes || null,
    ];

    const { rows } = await pool.query(insertQuery, values);
    const booking = rows[0];

    if (Array.isArray(experience_ids) && experience_ids.length) {
      const insertExperienceQuery = `INSERT INTO booking_experiences (booking_id, experience_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`;
      for (const experienceId of experience_ids) {
        await pool.query(insertExperienceQuery, [booking.id, experienceId]);
      }
    }

    return res.status(201).json({ data: booking });
  } catch (error) {
    console.error('createBooking error:', error);
    return res.status(500).json({ error: 'Failed to create booking.' });
  }
}

export async function getBookings(req, res) {
  try {
    const user = req.user;
    let query = '';
    let values = [];

    const experienceSubquery = `
      COALESCE(
        json_agg(e.name ORDER BY e.name) FILTER (WHERE e.name IS NOT NULL),
        '[]'
      ) AS experience_names
    `;

    if (user.role === 'superadmin') {
      query = `
        SELECT b.*, p.name AS plantation_name, ${experienceSubquery}
        FROM bookings b
        LEFT JOIN plantations p ON p.id = b.plantation_id
        LEFT JOIN booking_experiences be ON be.booking_id = b.id
        LEFT JOIN experiences e ON e.id = be.experience_id
        GROUP BY b.id, p.name
        ORDER BY b.created_at DESC
      `;
    } else if (user.role === 'plantationadmin') {
      query = `
        SELECT b.*, p.name AS plantation_name, ${experienceSubquery}
        FROM bookings b
        LEFT JOIN plantations p ON p.id = b.plantation_id
        LEFT JOIN booking_experiences be ON be.booking_id = b.id
        LEFT JOIN experiences e ON e.id = be.experience_id
        WHERE b.plantation_id = $1
        GROUP BY b.id, p.name
        ORDER BY b.created_at DESC
      `;
      values = [user.plantation_id];
    } else {
      query = `
        SELECT b.*, p.name AS plantation_name, ${experienceSubquery}
        FROM bookings b
        LEFT JOIN plantations p ON p.id = b.plantation_id
        LEFT JOIN booking_experiences be ON be.booking_id = b.id
        LEFT JOIN experiences e ON e.id = be.experience_id
        WHERE b.tourist_id = $1
        GROUP BY b.id, p.name
        ORDER BY b.created_at DESC
      `;
      values = [user.id];
    }

    const { rows } = await pool.query(query, values);
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('getBookings error:', error);
    return res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
}

export async function getBookingById(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing booking id parameter.' });

  try {
    const { rows } = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = rows[0];
    const user = req.user;

    if (user.role === 'tourist' && booking.tourist_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (user.role === 'plantationadmin' && booking.plantation_id !== user.plantation_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.status(200).json({ data: booking });
  } catch (error) {
    console.error('getBookingById error:', error);
    return res.status(500).json({ error: 'Failed to fetch booking.' });
  }
}

export async function updateBookingStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (!id || !status) {
    return res.status(400).json({ error: 'Booking id and status are required.' });
  }

  try {
    const { rows } = await pool.query(
      'UPDATE bookings SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('updateBookingStatus error:', error);
    return res.status(500).json({ error: 'Failed to update booking status.' });
  }
}

export async function cancelBooking(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing booking id parameter.' });

  try {
    const { rows } = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = rows[0];
    const user = req.user;
    if (user.role === 'tourist' && booking.tourist_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updateResult = await pool.query(
      'UPDATE bookings SET status = $1, cancelled_by = $2, updated_at = now() WHERE id = $3 RETURNING *',
      ['cancelled', 'tourist', id]
    );

    return res.status(200).json({ data: updateResult.rows[0] });
  } catch (error) {
    console.error('cancelBooking error:', error);
    return res.status(500).json({ error: 'Failed to cancel booking.' });
  }
}
