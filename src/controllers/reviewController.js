import pool from '../config/db.js';

export async function getReviewsByPlantation(req, res) {
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

    const data = reviewsResult.rows.map((review) => ({
      ...review,
      replies: repliesByReview[review.id] || [],
    }));

    return res.status(200).json({ data });
  } catch (error) {
    console.error('getReviewsByPlantation error:', error);
    return res.status(500).json({ error: 'Failed to fetch reviews.' });
  }
}

export async function createReview(req, res) {
  try {
    const user = req.user;
    const { plantation_id, booking_id, rating, title, content, image_url } = req.body;

    if (!plantation_id || !rating || !content) {
      return res.status(400).json({ error: 'Plantation, rating, and content are required.' });
    }

    const insertQuery = `
      INSERT INTO reviews (
        plantation_id,
        tourist_id,
        booking_id,
        rating,
        title,
        content,
        image_url,
        is_verified
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `;

    const values = [
      plantation_id,
      user.id,
      booking_id || null,
      rating,
      title || null,
      content,
      image_url || null,
      false,
    ];

    const { rows } = await pool.query(insertQuery, values);
    return res.status(201).json({ data: rows[0] });
  } catch (error) {
    console.error('createReview error:', error);
    return res.status(500).json({ error: 'Failed to create review.' });
  }
}

export async function addReviewReply(req, res) {
  try {
    const user = req.user;
    const { reviewId } = req.params;
    const { content } = req.body;

    if (!reviewId || !content) {
      return res.status(400).json({ error: 'Review id and reply content are required.' });
    }

    const authorName = user.username || user.name || user.email || 'Plantation Admin';
    const insertQuery = `
      INSERT INTO review_replies (
        review_id,
        plantation_admin_id,
        author_name,
        content,
        is_verified
      ) VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `;

    const values = [reviewId, user.id, authorName, content, false];
    const { rows } = await pool.query(insertQuery, values);
    return res.status(201).json({ data: rows[0] });
  } catch (error) {
    console.error('addReviewReply error:', error);
    return res.status(500).json({ error: 'Failed to add review reply.' });
  }
}

export async function deleteReviewReply(req, res) {
  try {
    const user = req.user;
    const { reviewId, replyId } = req.params;

    if (!reviewId || !replyId) {
      return res.status(400).json({ error: 'Review id and reply id are required.' });
    }

    const existing = await pool.query('SELECT * FROM review_replies WHERE id = $1 AND review_id = $2', [replyId, reviewId]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: 'Reply not found.' });
    }

    const reply = existing.rows[0];
    if (reply.plantation_admin_id !== user.id && user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { rows } = await pool.query('DELETE FROM review_replies WHERE id = $1 RETURNING *', [replyId]);
    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('deleteReviewReply error:', error);
    return res.status(500).json({ error: 'Failed to delete review reply.' });
  }
}
