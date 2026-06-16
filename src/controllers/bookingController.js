import pool from '../config/db.js';
import { generateBookingReference } from '../utils/generators.js';
import { STARTER_BOOKING_LIMIT } from '../constants/index.js';

export async function createBooking(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const user = req.user;
    const {
      plantation_id,
      booking_date,
      booking_time,
      num_adults,
      num_children,
      total_price_usd,
      total_price_lkr,
      tourist_full_name,
      tourist_email,
      tourist_phone,
      tourist_country,
      tourist_city,
      tourist_nic_passport,
      special_notes,
      experience_ids,
    } = req.body;

    if (!plantation_id || !booking_date || !tourist_full_name || !tourist_email) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Missing required booking fields.' });
    }

    const adults = num_adults || 1;
    const children = num_children || 0;
    const totalGuests = adults + children;

    // booking_time comes from the tourist's selected visit time (HH:MM)
    const bookingTime = booking_time || null;

    // Starter plan: enforce the per-subscription-year booking cap. Pro is unlimited.
    const { rows: subRows } = await client.query(
      `SELECT subscription_type, start_date, end_date
       FROM plantation_subscriptions
       WHERE plantation_id = $1 AND status = 'active'
       ORDER BY end_date DESC LIMIT 1`,
      [plantation_id]
    );
    if (subRows.length && subRows[0].subscription_type === 'starter') {
      const { start_date, end_date } = subRows[0];
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS count FROM bookings
         WHERE plantation_id = $1 AND status != 'cancelled'
           AND booking_date BETWEEN $2 AND $3`,
        [plantation_id, start_date, end_date]
      );
      if (countRows[0].count >= STARTER_BOOKING_LIMIT) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `This plantation has reached its Starter plan limit of ${STARTER_BOOKING_LIMIT.toLocaleString()} bookings for this subscription year. Upgrade to Pro for unlimited bookings.`,
        });
      }
    }

    // Capacity check against plantation-level time slot
    if (bookingTime) {
      const capRow = await client.query(
        `SELECT
           pts.capacity,
           COALESCE(
             (SELECT SUM(b.num_adults + b.num_children)
              FROM bookings b
              WHERE b.plantation_id = $1
                AND b.booking_date  = $2::date
                AND b.booking_time  = pts.slot_time
                AND b.status       != 'cancelled'),
             0
           )::int AS booked
         FROM plantation_time_slots pts
         WHERE pts.plantation_id = $1
           AND pts.slot_time     = $3::time
           AND pts.day_of_week   = EXTRACT(DOW FROM $2::date)::int
           AND pts.is_active     = true`,
        [plantation_id, booking_date, bookingTime]
      );
      if (capRow.rows.length) {
        const { capacity, booked } = capRow.rows[0];
        if (booked + totalGuests > capacity) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: `The ${bookingTime} slot is full. Please choose another time or reduce guests.`,
            available: Math.max(0, capacity - booked),
          });
        }
      }
    }

    const bookingReference = generateBookingReference();
    const { rows } = await client.query(
      `INSERT INTO bookings (
        booking_reference, plantation_id, tourist_id, booking_date, booking_time,
        num_adults, num_children, total_price_usd, total_price_lkr,
        tourist_full_name, tourist_email, tourist_phone, tourist_country,
        tourist_city, tourist_nic_passport, special_notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        bookingReference, plantation_id, user.id, booking_date, bookingTime,
        adults, children,
        total_price_usd || null, total_price_lkr || null,
        tourist_full_name, tourist_email,
        tourist_phone || null, tourist_country || null,
        tourist_city || null, tourist_nic_passport || null, special_notes || null,
      ]
    );
    const booking = rows[0];

    if (Array.isArray(experience_ids) && experience_ids.length) {
      for (const experienceId of experience_ids) {
        await client.query(
          `INSERT INTO booking_experiences (booking_id, experience_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [booking.id, experienceId]
        );
      }
    }

    await client.query('COMMIT');
    return res.status(201).json({ data: booking });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('createBooking error:', error);
    return res.status(500).json({ error: 'Failed to create booking.' });
  } finally {
    client.release();
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = rows[0];
    const user = req.user;
    if (user.role === 'tourist' && booking.tourist_id !== user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (booking.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Booking is already cancelled.' });
    }

    // Count-based capacity — no counter to decrement; cancelling the booking
    // is enough (the availability query excludes cancelled bookings).

    const updateResult = await client.query(
      'UPDATE bookings SET status = $1, cancelled_by = $2, updated_at = now() WHERE id = $3 RETURNING *',
      ['cancelled', 'tourist', id]
    );

    await client.query('COMMIT');
    return res.status(200).json({ data: updateResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('cancelBooking error:', error);
    return res.status(500).json({ error: 'Failed to cancel booking.' });
  } finally {
    client.release();
  }
}
