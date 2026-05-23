import pool from '../config/db.js';
import { uploadImage } from '../services/storageService.js';

export async function getPlantations(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, name, address, description, main_image_url, rating, total_reviews, is_disabled, created_at
       FROM plantations
       WHERE is_disabled = false
       ORDER BY created_at DESC`
    );

    return res.status(200).json({ data: result.rows });
  } catch (error) {
    console.error('getPlantations error:', error);
    return res.status(500).json({ error: 'Failed to fetch plantations.' });
  }
}

export async function getPlantationById(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing plantation id parameter.' });

  try {
    const plantationResult = await pool.query('SELECT * FROM plantations WHERE id = $1', [id]);
    if (!plantationResult.rows.length) {
      return res.status(404).json({ error: 'Plantation not found.' });
    }

    const galleryResult = await pool.query(
      'SELECT image_url FROM plantation_gallery_images WHERE plantation_id = $1 ORDER BY sort_order, created_at',
      [id]
    );

    const experiencesResult = await pool.query(
      'SELECT id, name, short_description, price_usd_adult, price_usd_child, price_lkr_adult, price_lkr_child, is_active FROM experiences WHERE plantation_id = $1 AND is_active = true ORDER BY created_at DESC',
      [id]
    );

    const reviewsResult = await pool.query(
      `SELECT r.id, r.rating, r.title, r.content, r.image_url, r.created_at, r.updated_at, u.username AS tourist_username, u.email AS tourist_email
       FROM reviews r
       LEFT JOIN users u ON u.id = r.tourist_id
       WHERE r.plantation_id = $1
       ORDER BY r.created_at DESC`,
      [id]
    );

    return res.status(200).json({
      data: {
        ...plantationResult.rows[0],
        gallery: galleryResult.rows.map((row) => row.image_url),
        experiences: experiencesResult.rows,
        reviews: reviewsResult.rows,
      },
    });
  } catch (error) {
    console.error('getPlantationById error:', error);
    return res.status(500).json({ error: 'Failed to fetch plantation details.' });
  }
}

export async function getPlantationExperiences(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing plantation id parameter.' });

  try {
    const results = await pool.query(
      'SELECT id, name, short_description, detailed_description, category, announcement, price_usd_adult, price_usd_child, price_lkr_adult, price_lkr_child, is_active, created_at FROM experiences WHERE plantation_id = $1 ORDER BY created_at DESC',
      [id]
    );

    return res.status(200).json({ data: results.rows });
  } catch (error) {
    console.error('getPlantationExperiences error:', error);
    return res.status(500).json({ error: 'Failed to fetch experiences for the plantation.' });
  }
}

export async function getPlantationReviews(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing plantation id parameter.' });

  try {
    const reviewsResult = await pool.query(
      `SELECT r.id, r.rating, r.title, r.content, r.image_url, r.is_verified, r.helpful_count, r.unhelpful_count, r.created_at, r.updated_at,
              u.username AS tourist_username, u.email AS tourist_email
       FROM reviews r
       LEFT JOIN users u ON u.id = r.tourist_id
       WHERE r.plantation_id = $1
       ORDER BY r.created_at DESC`,
      [id]
    );

    const reviewIds = reviewsResult.rows.map((review) => review.id);
    const repliesResult = reviewIds.length
      ? await pool.query(
          `SELECT rr.id, rr.review_id, rr.author_name, rr.content, rr.is_verified, rr.created_at, rr.updated_at
           FROM review_replies rr
           WHERE rr.review_id = ANY($1::uuid[])
           ORDER BY rr.created_at ASC`,
          [reviewIds]
        )
      : { rows: [] };

    const repliesByReview = repliesResult.rows.reduce((acc, reply) => {
      acc[reply.review_id] = acc[reply.review_id] || [];
      acc[reply.review_id].push(reply);
      return acc;
    }, {});

    const reviews = reviewsResult.rows.map((review) => ({
      ...review,
      replies: repliesByReview[review.id] || [],
    }));

    return res.status(200).json({ data: reviews });
  } catch (error) {
    console.error('getPlantationReviews error:', error);
    return res.status(500).json({ error: 'Failed to fetch plantation reviews.' });
  }
}

function mapFields(values, authors) {
  return values.map((field) => field && field.toString().trim()).filter(Boolean);
}

export async function createPlantation(req, res) {
  try {
    const {
      name,
      address,
      description,
      detailed_description,
      best_time_to_visit,
      phone,
      email,
      altitude,
      area,
      established_year,
    } = req.body;

    if (!name || !address) {
      return res.status(400).json({ error: 'Plantation name and address are required.' });
    }

    const imageUrl = req.file?.buffer ? await uploadImage(req.file.buffer) : null;

    const insertQuery = `
      INSERT INTO plantations (
        name,
        address,
        description,
        detailed_description,
        best_time_to_visit,
        phone,
        email,
        altitude,
        area,
        established_year,
        main_image_url
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `;

    const values = [
      name,
      address,
      description || null,
      detailed_description || null,
      best_time_to_visit || null,
      phone || null,
      email || null,
      altitude || null,
      area || null,
      established_year || null,
      imageUrl,
    ];

    const { rows } = await pool.query(insertQuery, values);
    return res.status(201).json({ data: rows[0] });
  } catch (error) {
    console.error('createPlantation error:', error);
    return res.status(500).json({ error: 'Failed to create plantation.' });
  }
}

export async function updatePlantation(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing plantation id parameter.' });

  try {
    const body = req.body || {};
    const imageUrl = req.file?.buffer ? await uploadImage(req.file.buffer) : null;
    const fields = [];
    const values = [];

    const updatableFields = [
      'name',
      'address',
      'description',
      'detailed_description',
      'best_time_to_visit',
      'phone',
      'email',
      'altitude',
      'area',
      'established_year',
      'is_disabled',
    ];

    updatableFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        fields.push(`${field} = $${values.length + 1}`);
        values.push(body[field]);
      }
    });

    if (imageUrl) {
      fields.push(`main_image_url = $${values.length + 1}`);
      values.push(imageUrl);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update.' });
    }

    values.push(id);
    const query = `UPDATE plantations SET ${fields.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`;
    const { rows } = await pool.query(query, values);

    if (!rows.length) {
      return res.status(404).json({ error: 'Plantation not found.' });
    }

    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('updatePlantation error:', error);
    return res.status(500).json({ error: 'Failed to update plantation.' });
  }
}

export async function deletePlantation(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing plantation id parameter.' });

  try {
    const { rows } = await pool.query(
      'UPDATE plantations SET is_disabled = true, updated_at = now() WHERE id = $1 RETURNING *',
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Plantation not found.' });
    }

    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('deletePlantation error:', error);
    return res.status(500).json({ error: 'Failed to delete plantation.' });
  }
}
