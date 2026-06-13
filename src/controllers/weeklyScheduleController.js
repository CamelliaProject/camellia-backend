import pool from '../config/db.js';

const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ── Experience weekly slots ───────────────────────────────────────────────────

export async function getWeeklySlots(req, res) {
  const { id: experienceId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM experience_weekly_slots
       WHERE experience_id = $1
       ORDER BY day_of_week, slot_time`,
      [experienceId]
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error('getWeeklySlots error:', err);
    return res.status(500).json({ error: 'Failed to fetch weekly slots.' });
  }
}

export async function createWeeklySlot(req, res) {
  const { id: experienceId } = req.params;
  const { day_of_week, slot_time, capacity } = req.body;
  if (day_of_week == null || !slot_time) {
    return res.status(400).json({ error: 'day_of_week and slot_time are required.' });
  }
  const cap = parseInt(capacity, 10) || 10;
  try {
    const { rows } = await pool.query(
      `INSERT INTO experience_weekly_slots (experience_id, day_of_week, slot_time, capacity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (experience_id, day_of_week, slot_time)
       DO UPDATE SET capacity = EXCLUDED.capacity, is_active = true
       RETURNING *`,
      [experienceId, Number(day_of_week), slot_time, cap]
    );
    return res.status(201).json({ data: rows[0] });
  } catch (err) {
    console.error('createWeeklySlot error:', err);
    return res.status(500).json({ error: 'Failed to create weekly slot.' });
  }
}

async function countSlotUpcomingBookings(slot) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM bookings b
     JOIN booking_experiences be ON be.booking_id = b.id
     WHERE be.experience_id = $1
       AND b.booking_time   = $2
       AND EXTRACT(DOW FROM b.booking_date)::int = $3
       AND b.status         = 'upcoming'`,
    [slot.experience_id, slot.slot_time, slot.day_of_week]
  );
  return rows[0].count;
}

async function getBookedGuestsForWeeklySlot(slot) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(b.num_adults + b.num_children), 0)::int AS booked_guests
     FROM bookings b
     JOIN booking_experiences be ON be.booking_id = b.id
     WHERE be.experience_id = $1
       AND b.booking_time   = $2
       AND EXTRACT(DOW FROM b.booking_date)::int = $3
       AND b.status         = 'upcoming'`,
    [slot.experience_id, slot.slot_time, slot.day_of_week]
  );
  return rows[0].booked_guests;
}

export async function updateWeeklySlot(req, res) {
  const { slotId } = req.params;
  const { capacity } = req.body;
  const cap = parseInt(capacity, 10);
  if (!cap || cap < 1) return res.status(400).json({ error: 'Capacity must be at least 1.' });
  try {
    const slotRes = await pool.query('SELECT * FROM experience_weekly_slots WHERE id = $1', [slotId]);
    if (!slotRes.rows.length) return res.status(404).json({ error: 'Slot not found.' });
    const slot = slotRes.rows[0];

    const bookedGuests = await getBookedGuestsForWeeklySlot(slot);
    if (bookedGuests > 0 && cap < bookedGuests) {
      return res.status(409).json({
        error: `Cannot reduce capacity below ${bookedGuests} — that is the number of guests already booked for this slot. You may increase it.`,
        booked_guests: bookedGuests,
        min_capacity: bookedGuests,
      });
    }

    const { rows } = await pool.query(
      `UPDATE experience_weekly_slots SET capacity = $1 WHERE id = $2 RETURNING *`,
      [cap, slotId]
    );
    return res.json({ data: rows[0] });
  } catch (err) {
    console.error('updateWeeklySlot error:', err);
    return res.status(500).json({ error: 'Failed to update slot.' });
  }
}

export async function deleteWeeklySlot(req, res) {
  const { slotId } = req.params;
  try {
    const slotRes = await pool.query('SELECT * FROM experience_weekly_slots WHERE id = $1', [slotId]);
    if (!slotRes.rows.length) return res.status(404).json({ error: 'Slot not found.' });
    const slot = slotRes.rows[0];

    const activeCount = await countSlotUpcomingBookings(slot);
    if (activeCount > 0) {
      return res.status(409).json({
        error: `Cannot delete: this time slot has ${activeCount} upcoming booking${activeCount > 1 ? 's' : ''}. Cancel or complete them first.`,
        booking_count: activeCount,
      });
    }

    await pool.query('DELETE FROM experience_weekly_slots WHERE id = $1', [slotId]);
    return res.json({ data: { deleted: true } });
  } catch (err) {
    console.error('deleteWeeklySlot error:', err);
    return res.status(500).json({ error: 'Failed to delete slot.' });
  }
}

/**
 * GET /experiences/:id/availability?date=YYYY-MM-DD
 * Returns the weekly slots for that date's day-of-week, each enriched with
 * real-time booked count (from actual confirmed bookings).
 */
export async function getExperienceAvailability(req, res) {
  const { id: experienceId } = req.params;
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD).' });

  try {
    const { rows } = await pool.query(
      `SELECT
         ews.id,
         ews.day_of_week,
         ews.slot_time,
         ews.capacity,
         COALESCE(
           (SELECT SUM(b.num_adults + b.num_children)
            FROM bookings b
            JOIN booking_experiences be ON be.booking_id = b.id
            WHERE be.experience_id = ews.experience_id
              AND b.booking_date  = $2::date
              AND b.booking_time  = ews.slot_time
              AND b.status       != 'cancelled'),
           0
         )::int AS booked
       FROM experience_weekly_slots ews
       WHERE ews.experience_id = $1
         AND ews.day_of_week   = EXTRACT(DOW FROM $2::date)::int
         AND ews.is_active     = true
       ORDER BY ews.slot_time`,
      [experienceId, date]
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error('getExperienceAvailability error:', err);
    return res.status(500).json({ error: 'Failed to fetch availability.' });
  }
}

// ── Plantation availability settings ─────────────────────────────────────────

export async function getAvailabilitySettings(req, res) {
  const { id: plantationId } = req.params;
  try {
    const [daysRes, datesRes] = await Promise.all([
      pool.query(
        'SELECT day_of_week FROM plantation_unavailable_days WHERE plantation_id = $1 ORDER BY day_of_week',
        [plantationId]
      ),
      pool.query(
        'SELECT id, close_date, reason FROM plantation_closing_dates WHERE plantation_id = $1 ORDER BY close_date',
        [plantationId]
      ),
    ]);
    return res.json({
      data: {
        unavailable_days: daysRes.rows.map(r => r.day_of_week),
        closing_dates: datesRes.rows,
      },
    });
  } catch (err) {
    console.error('getAvailabilitySettings error:', err);
    return res.status(500).json({ error: 'Failed to fetch availability settings.' });
  }
}

/** Replace the entire list of unavailable days in one call. */
export async function updateUnavailableDays(req, res) {
  const { id: plantationId } = req.params;
  const { days } = req.body; // number[] 0-6
  if (!Array.isArray(days)) return res.status(400).json({ error: 'days must be an array.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM plantation_unavailable_days WHERE plantation_id = $1', [plantationId]);
    for (const d of days) {
      if (d >= 0 && d <= 6) {
        await client.query(
          'INSERT INTO plantation_unavailable_days (plantation_id, day_of_week) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [plantationId, d]
        );
      }
    }
    await client.query('COMMIT');
    return res.json({ data: { unavailable_days: days } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('updateUnavailableDays error:', err);
    return res.status(500).json({ error: 'Failed to update unavailable days.' });
  } finally {
    client.release();
  }
}

export async function addClosingDate(req, res) {
  const { id: plantationId } = req.params;
  const { close_date, reason } = req.body;
  if (!close_date) return res.status(400).json({ error: 'close_date is required.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO plantation_closing_dates (plantation_id, close_date, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (plantation_id, close_date) DO UPDATE SET reason = EXCLUDED.reason
       RETURNING *`,
      [plantationId, close_date, reason || null]
    );
    return res.status(201).json({ data: rows[0] });
  } catch (err) {
    console.error('addClosingDate error:', err);
    return res.status(500).json({ error: 'Failed to add closing date.' });
  }
}

export async function removeClosingDate(req, res) {
  const { closeId } = req.params;
  try {
    const { rows } = await pool.query(
      'DELETE FROM plantation_closing_dates WHERE id = $1 RETURNING id',
      [closeId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Closing date not found.' });
    return res.json({ data: { deleted: true } });
  } catch (err) {
    console.error('removeClosingDate error:', err);
    return res.status(500).json({ error: 'Failed to remove closing date.' });
  }
}

async function countPlantationSlotUpcomingBookings(slot) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM bookings b
     WHERE b.plantation_id = $1
       AND b.booking_time   = $2
       AND EXTRACT(DOW FROM b.booking_date)::int = $3
       AND b.status         = 'upcoming'`,
    [slot.plantation_id, slot.slot_time, slot.day_of_week]
  );
  return rows[0].count;
}

async function getBookedGuestsForPlantationSlot(slot) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(b.num_adults + b.num_children), 0)::int AS booked_guests
     FROM bookings b
     WHERE b.plantation_id = $1
       AND b.booking_time   = $2
       AND EXTRACT(DOW FROM b.booking_date)::int = $3
       AND b.status         = 'upcoming'`,
    [slot.plantation_id, slot.slot_time, slot.day_of_week]
  );
  return rows[0].booked_guests;
}

// ── Plantation-level time slots ───────────────────────────────────────────────

export async function getPlantationTimeSlots(req, res) {
  const { id: plantationId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT pts.*,
              COALESCE(
                (SELECT COUNT(*)::int
                 FROM bookings b
                 WHERE b.plantation_id = pts.plantation_id
                   AND b.booking_time  = pts.slot_time
                   AND EXTRACT(DOW FROM b.booking_date)::int = pts.day_of_week
                   AND b.status = 'upcoming'),
                0
              ) AS upcoming_booking_count,
              COALESCE(
                (SELECT SUM(b.num_adults + b.num_children)::int
                 FROM bookings b
                 WHERE b.plantation_id = pts.plantation_id
                   AND b.booking_time  = pts.slot_time
                   AND EXTRACT(DOW FROM b.booking_date)::int = pts.day_of_week
                   AND b.status = 'upcoming'),
                0
              ) AS booked_guests
       FROM plantation_time_slots pts
       WHERE pts.plantation_id = $1
       ORDER BY pts.day_of_week, pts.slot_time`,
      [plantationId]
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error('getPlantationTimeSlots error:', err);
    return res.status(500).json({ error: 'Failed to fetch plantation time slots.' });
  }
}

export async function createPlantationTimeSlot(req, res) {
  const { id: plantationId } = req.params;
  const { day_of_week, slot_time, capacity } = req.body;
  if (day_of_week == null || !slot_time) {
    return res.status(400).json({ error: 'day_of_week and slot_time are required.' });
  }
  const cap = parseInt(capacity, 10) || 20;
  try {
    const { rows } = await pool.query(
      `INSERT INTO plantation_time_slots (plantation_id, day_of_week, slot_time, capacity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (plantation_id, day_of_week, slot_time)
       DO UPDATE SET capacity = EXCLUDED.capacity, is_active = true
       RETURNING *`,
      [plantationId, Number(day_of_week), slot_time, cap]
    );
    return res.status(201).json({ data: rows[0] });
  } catch (err) {
    console.error('createPlantationTimeSlot error:', err);
    return res.status(500).json({ error: 'Failed to create plantation time slot.' });
  }
}

export async function updatePlantationTimeSlot(req, res) {
  const { slotId } = req.params;
  const { capacity } = req.body;
  const cap = parseInt(capacity, 10);
  if (!cap || cap < 1) return res.status(400).json({ error: 'Capacity must be at least 1.' });
  try {
    const slotRes = await pool.query('SELECT * FROM plantation_time_slots WHERE id = $1', [slotId]);
    if (!slotRes.rows.length) return res.status(404).json({ error: 'Slot not found.' });
    const slot = slotRes.rows[0];

    const bookedGuests = await getBookedGuestsForPlantationSlot(slot);
    if (bookedGuests > 0 && cap < bookedGuests) {
      return res.status(409).json({
        error: `Cannot reduce capacity below ${bookedGuests} — that is the number of guests already booked for this slot. You may increase it.`,
        booked_guests: bookedGuests,
        min_capacity: bookedGuests,
      });
    }

    const { rows } = await pool.query(
      `UPDATE plantation_time_slots SET capacity = $1 WHERE id = $2 RETURNING *`,
      [cap, slotId]
    );
    return res.json({ data: rows[0] });
  } catch (err) {
    console.error('updatePlantationTimeSlot error:', err);
    return res.status(500).json({ error: 'Failed to update slot.' });
  }
}

export async function deletePlantationTimeSlot(req, res) {
  const { slotId } = req.params;
  try {
    const slotRes = await pool.query('SELECT * FROM plantation_time_slots WHERE id = $1', [slotId]);
    if (!slotRes.rows.length) return res.status(404).json({ error: 'Slot not found.' });
    const slot = slotRes.rows[0];

    const activeCount = await countPlantationSlotUpcomingBookings(slot);
    if (activeCount > 0) {
      return res.status(409).json({
        error: `Cannot delete: this time slot has ${activeCount} upcoming booking${activeCount > 1 ? 's' : ''}. Cancel or complete them first.`,
        booking_count: activeCount,
      });
    }

    await pool.query('DELETE FROM plantation_time_slots WHERE id = $1', [slotId]);
    return res.json({ data: { deleted: true } });
  } catch (err) {
    console.error('deletePlantationTimeSlot error:', err);
    return res.status(500).json({ error: 'Failed to delete slot.' });
  }
}

/**
 * GET /plantations/:id/time-slots/availability?date=YYYY-MM-DD
 * Returns plantation time slots for that date's day-of-week with live booked count.
 */
export async function getPlantationSlotAvailability(req, res) {
  const { id: plantationId } = req.params;
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD).' });

  try {
    const { rows } = await pool.query(
      `SELECT
         pts.id,
         pts.day_of_week,
         pts.slot_time,
         pts.capacity,
         COALESCE(
           (SELECT SUM(b.num_adults + b.num_children)
            FROM bookings b
            WHERE b.plantation_id = pts.plantation_id
              AND b.booking_date  = $2::date
              AND b.booking_time  = pts.slot_time
              AND b.status       != 'cancelled'),
           0
         )::int AS booked
       FROM plantation_time_slots pts
       WHERE pts.plantation_id = $1
         AND pts.day_of_week   = EXTRACT(DOW FROM $2::date)::int
         AND pts.is_active     = true
       ORDER BY pts.slot_time`,
      [plantationId, date]
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error('getPlantationSlotAvailability error:', err);
    return res.status(500).json({ error: 'Failed to fetch availability.' });
  }
}

export { DOW_NAMES };
