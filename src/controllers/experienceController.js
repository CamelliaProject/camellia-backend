import pool from '../config/db.js';
import { uploadImage } from '../services/storageService.js';

export async function getExperiencesByPlantation(req, res) {
  const { plantationId } = req.params;
  if (!plantationId) return res.status(400).json({ error: 'Missing plantation id parameter.' });

  try {
    const results = await pool.query(
      `SELECT id, plantation_id, name, short_description, detailed_description, category, announcement,
              price_usd_adult, price_usd_child, price_lkr_adult, price_lkr_child, is_active, created_at, updated_at
       FROM experiences
       WHERE plantation_id = $1
       ORDER BY created_at DESC`,
      [plantationId]
    );

    return res.status(200).json({ data: results.rows });
  } catch (error) {
    console.error('getExperiencesByPlantation error:', error);
    return res.status(500).json({ error: 'Failed to fetch experiences.' });
  }
}

export async function getExperienceById(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing experience id parameter.' });

  try {
    const experienceResult = await pool.query('SELECT * FROM experiences WHERE id = $1', [id]);
    if (!experienceResult.rows.length) {
      return res.status(404).json({ error: 'Experience not found.' });
    }

    const slotsResult = await pool.query(
      'SELECT * FROM time_slots WHERE experience_id = $1 ORDER BY slot_date, slot_time',
      [id]
    );

    return res.status(200).json({ data: { ...experienceResult.rows[0], slots: slotsResult.rows } });
  } catch (error) {
    console.error('getExperienceById error:', error);
    return res.status(500).json({ error: 'Failed to fetch experience details.' });
  }
}

export async function getExperienceSlots(req, res) {
  const { id } = req.params;
  const { date } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing experience id parameter.' });

  try {
    let query = 'SELECT * FROM time_slots WHERE experience_id = $1';
    const values = [id];
    if (date) {
      query += ' AND slot_date = $2';
      values.push(date);
    }
    query += ' ORDER BY slot_date, slot_time';
    const result = await pool.query(query, values);
    return res.status(200).json({ data: result.rows });
  } catch (error) {
    console.error('getExperienceSlots error:', error);
    return res.status(500).json({ error: 'Failed to fetch experience slots.' });
  }
}

export async function createExperience(req, res) {
  try {
    const {
      plantation_id,
      name,
      short_description,
      detailed_description,
      category,
      announcement,
      price_usd_adult,
      price_usd_child,
      price_lkr_adult,
      price_lkr_child,
      is_active,
    } = req.body;

    if (!plantation_id || !name) {
      return res.status(400).json({ error: 'Plantation id and experience name are required.' });
    }

    const insertQuery = `
      INSERT INTO experiences (
        plantation_id,
        name,
        short_description,
        detailed_description,
        category,
        announcement,
        price_usd_adult,
        price_usd_child,
        price_lkr_adult,
        price_lkr_child,
        is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `;

    const values = [
      plantation_id,
      name,
      short_description || null,
      detailed_description || null,
      category || null,
      announcement || null,
      price_usd_adult || null,
      price_usd_child || null,
      price_lkr_adult || null,
      price_lkr_child || null,
      is_active !== undefined ? is_active : true,
    ];

    const { rows } = await pool.query(insertQuery, values);
    const experienceId = rows[0].id;

    // Upload all provided images to Cloudinary and save to experience_images
    const files = req.files || (req.file ? [req.file] : []);
    if (files.length > 0) {
      const uploadedUrls = await Promise.all(files.map(f => uploadImage(f.buffer)));
      for (const url of uploadedUrls) {
        await pool.query(
          'INSERT INTO experience_images (experience_id, image_url) VALUES ($1, $2)',
          [experienceId, url]
        );
      }
    }

    // Return with images array so the frontend can display them immediately
    const imagesResult = await pool.query(
      'SELECT image_url FROM experience_images WHERE experience_id = $1 ORDER BY sort_order, created_at',
      [experienceId]
    );
    rows[0].images = imagesResult.rows.map(r => r.image_url);

    return res.status(201).json({ data: rows[0] });
  } catch (error) {
    console.error('createExperience error:', error);
    return res.status(500).json({ error: 'Failed to create experience.' });
  }
}

async function countUpcomingBookings(experienceId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM booking_experiences be
     JOIN bookings b ON b.id = be.booking_id
     WHERE be.experience_id = $1 AND b.status = 'upcoming'`,
    [experienceId]
  );
  return rows[0].count;
}

export async function updateExperience(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing experience id parameter.' });

  try {
    const activeCount = await countUpcomingBookings(id);
    if (activeCount > 0) {
      return res.status(409).json({
        error: `This experience has ${activeCount} upcoming booking${activeCount > 1 ? 's' : ''}. Cancel or complete all bookings before making changes.`,
        booking_count: activeCount,
      });
    }
    const body = req.body || {};
    const fields = [];
    const values = [];

    const updatableFields = [
      'name',
      'short_description',
      'detailed_description',
      'category',
      'announcement',
      'price_usd_adult',
      'price_usd_child',
      'price_lkr_adult',
      'price_lkr_child',
      'is_active',
    ];

    updatableFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        fields.push(`${field} = $${values.length + 1}`);
        values.push(body[field]);
      }
    });

    const files = req.files || (req.file ? [req.file] : []);

    if (fields.length === 0 && files.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update.' });
    }

    let updatedRow = null;

    if (fields.length) {
      values.push(id);
      const query = `UPDATE experiences SET ${fields.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`;
      const result = await pool.query(query, values);
      if (!result.rows.length) {
        return res.status(404).json({ error: 'Experience not found.' });
      }
      updatedRow = result.rows[0];
    }

    // Upload all new images
    if (files.length > 0) {
      const uploadedUrls = await Promise.all(files.map(f => uploadImage(f.buffer)));
      for (const url of uploadedUrls) {
        await pool.query(
          'INSERT INTO experience_images (experience_id, image_url) VALUES ($1, $2)',
          [id, url]
        );
      }
    }

    // Always return with full images array
    const imagesResult = await pool.query(
      'SELECT image_url FROM experience_images WHERE experience_id = $1 ORDER BY sort_order, created_at',
      [id]
    );
    const images = imagesResult.rows.map(r => r.image_url);

    if (updatedRow) {
      updatedRow.images = images;
      return res.status(200).json({ data: updatedRow });
    }

    return res.status(200).json({ data: { id, images } });
  } catch (error) {
    console.error('updateExperience error:', error);
    return res.status(500).json({ error: 'Failed to update experience.' });
  }
}

export async function deleteExperience(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing experience id parameter.' });

  try {
    const activeCount = await countUpcomingBookings(id);
    if (activeCount > 0) {
      return res.status(409).json({
        error: `Cannot delete: this experience has ${activeCount} upcoming booking${activeCount > 1 ? 's' : ''}. Cancel or complete them first.`,
        booking_count: activeCount,
      });
    }

    const { rows } = await pool.query('DELETE FROM experiences WHERE id = $1 RETURNING *', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Experience not found.' });
    }
    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('deleteExperience error:', error);
    return res.status(500).json({ error: 'Failed to delete experience.' });
  }
}
export async function deleteExperienceImage(req, res) {
  const { id } = req.params;
  const { image_url } = req.body;

  if (!id || !image_url) {
    return res.status(400).json({ error: 'experience id and image_url are required.' });
  }

  try {
    await pool.query(
      'DELETE FROM experience_images WHERE experience_id = $1 AND image_url = $2',
      [id, image_url]
    );
    return res.status(200).json({ data: { deleted: true } });
  } catch (error) {
    console.error('deleteExperienceImage error:', error);
    return res.status(500).json({ error: 'Failed to delete experience image.' });
  }
}

export async function createExperienceSlot(req, res) {
  const experienceId = req.params.id || req.body.experience_id;
  const { slot_date, slot_time, available_seats, capacity } = req.body;
  const slotCapacity = capacity ?? available_seats;

  if (!experienceId || !slot_date || !slot_time) {
    return res.status(400).json({
      error: 'experience id, slot_date, and slot_time are required.'
    });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO time_slots (experience_id, slot_date, slot_time, capacity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (experience_id, slot_date, slot_time)
       DO UPDATE SET capacity = EXCLUDED.capacity, updated_at = now()
       RETURNING *`,
      [experienceId, slot_date, slot_time, slotCapacity || 10]
    );
    return res.status(201).json({ data: rows[0] });
  } catch (error) {
    console.error('createExperienceSlot error:', error);
    return res.status(500).json({ error: 'Failed to create experience slot.' });
  }
}

export async function updateExperienceSlot(req, res) {
  const { slotId } = req.params;
  const { capacity } = req.body;
  if (!slotId) return res.status(400).json({ error: 'Missing slot id.' });
  const cap = parseInt(capacity, 10);
  if (!cap || cap < 1) return res.status(400).json({ error: 'Capacity must be at least 1.' });

  try {
    const { rows } = await pool.query(
      `UPDATE time_slots SET capacity = $1, updated_at = now()
       WHERE id = $2 AND booked <= $1
       RETURNING *`,
      [cap, slotId]
    );
    if (!rows.length) {
      return res.status(409).json({ error: 'Slot not found or new capacity is less than already-booked count.' });
    }
    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('updateExperienceSlot error:', error);
    return res.status(500).json({ error: 'Failed to update slot.' });
  }
}

export async function deleteExperienceSlot(req, res) {
  const { slotId } = req.params;
  if (!slotId) return res.status(400).json({ error: 'Missing slot id.' });

  try {
    const check = await pool.query('SELECT booked FROM time_slots WHERE id = $1', [slotId]);
    if (!check.rows.length) return res.status(404).json({ error: 'Slot not found.' });
    if (check.rows[0].booked > 0) {
      return res.status(409).json({ error: 'Cannot delete a slot that already has bookings.' });
    }
    await pool.query('DELETE FROM time_slots WHERE id = $1', [slotId]);
    return res.status(200).json({ data: { deleted: true } });
  } catch (error) {
    console.error('deleteExperienceSlot error:', error);
    return res.status(500).json({ error: 'Failed to delete slot.' });
  }
}