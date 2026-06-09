import pool from '../config/db.js';
import { uploadFile } from '../services/storageService.js';

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
          `SELECT rr.id, rr.review_id, rr.author_name, rr.content, rr.is_verified,
                  rr.created_at, rr.updated_at, rr.author_role, rr.author_id,
                  COALESCE(rr.helpful_count, 0) AS helpful_count
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
    const { booking_id, rating, title, content, image_url } = req.body;

    if (!booking_id || !rating || !content) {
      return res.status(400).json({ error: 'Booking, rating, and content are required.' });
    }

    // Verify this is a completed booking belonging to this tourist and get plantation_id
    const bookingCheck = await pool.query(
      `SELECT id, plantation_id FROM bookings
       WHERE id = $1 AND tourist_id = $2 AND status = 'completed'`,
      [booking_id, user.id]
    );

    if (!bookingCheck.rows.length) {
      return res.status(403).json({ error: 'You must have completed this visit to leave a review.' });
    }

    const plantation_id = bookingCheck.rows[0].plantation_id;

    // Prevent duplicate review for the same booking
    const existingReview = await pool.query(
      `SELECT id FROM reviews WHERE tourist_id = $1 AND booking_id = $2 LIMIT 1`,
      [user.id, booking_id]
    );

    if (existingReview.rows.length) {
      return res.status(400).json({ error: 'You have already reviewed this visit.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO reviews (plantation_id, tourist_id, booking_id, rating, title, content, image_url, is_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [plantation_id, user.id, booking_id, rating, title || null, content, image_url || null, false]
    );

    // Keep plantation rating and total_reviews in sync
    await pool.query(
      `UPDATE plantations
       SET rating = (SELECT ROUND(AVG(rating)::numeric, 2) FROM reviews WHERE plantation_id = $1),
           total_reviews = (SELECT COUNT(*) FROM reviews WHERE plantation_id = $1),
           updated_at = now()
       WHERE id = $1`,
      [plantation_id]
    );

    return res.status(201).json({ data: rows[0] });
  } catch (error) {
    console.error('createReview error:', error);
    return res.status(500).json({ error: 'Failed to create review.' });
  }
}

export async function uploadReviewImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided.' });
    }

    const url = await uploadFile(req.file.buffer, { folder: 'camellia/reviews', resourceType: 'image' });
    return res.status(200).json({ url });
  } catch (error) {
    console.error('uploadReviewImage error:', error);
    return res.status(500).json({ error: 'Failed to upload image.' });
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

    // Get the review to determine which plantation it belongs to
    const reviewResult = await pool.query(
      'SELECT plantation_id FROM reviews WHERE id = $1',
      [reviewId]
    );

    if (!reviewResult.rows.length) {
      return res.status(404).json({ error: 'Review not found.' });
    }

    const { plantation_id } = reviewResult.rows[0];

    // Permission check
    let canReply = false;

    if (user.role === 'superadmin') {
      canReply = true;
    } else if (user.role === 'plantationadmin') {
      canReply = user.plantation_id === plantation_id;
    } else if (user.role === 'tourist') {
      // Tourist must have a completed booking for this plantation
      const bookingCheck = await pool.query(
        `SELECT id FROM bookings
         WHERE tourist_id = $1 AND plantation_id = $2 AND status = 'completed'
         LIMIT 1`,
        [user.id, plantation_id]
      );
      canReply = bookingCheck.rows.length > 0;
    }

    if (!canReply) {
      return res.status(403).json({ error: 'You must have visited this plantation to reply.' });
    }

    const authorName = user.username || user.name || user.email || 'User';
    const plantationAdminId = user.role === 'plantationadmin' ? user.id : null;

    const { rows } = await pool.query(
      `INSERT INTO review_replies (review_id, plantation_admin_id, author_id, author_name, content, author_role, is_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [reviewId, plantationAdminId, user.id, authorName, content, user.role, false]
    );

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

    const existing = await pool.query(
      'SELECT * FROM review_replies WHERE id = $1 AND review_id = $2',
      [replyId, reviewId]
    );

    if (!existing.rows.length) {
      return res.status(404).json({ error: 'Reply not found.' });
    }

    const reply = existing.rows[0];
    const isAuthor = reply.author_id === user.id || reply.plantation_admin_id === user.id;

    if (!isAuthor && user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { rows } = await pool.query(
      'DELETE FROM review_replies WHERE id = $1 RETURNING *',
      [replyId]
    );
    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('deleteReviewReply error:', error);
    return res.status(500).json({ error: 'Failed to delete review reply.' });
  }
}

export async function reactToReview(req, res) {
  const { reviewId } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE reviews SET helpful_count = helpful_count + 1 WHERE id = $1 RETURNING helpful_count`,
      [reviewId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Review not found.' });
    return res.status(200).json({ data: { helpful_count: rows[0].helpful_count } });
  } catch (error) {
    console.error('reactToReview error:', error);
    return res.status(500).json({ error: 'Failed to react.' });
  }
}

export async function reactToReply(req, res) {
  const { replyId } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE review_replies SET helpful_count = helpful_count + 1 WHERE id = $1 RETURNING helpful_count`,
      [replyId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Reply not found.' });
    return res.status(200).json({ data: { helpful_count: rows[0].helpful_count } });
  } catch (error) {
    console.error('reactToReply error:', error);
    return res.status(500).json({ error: 'Failed to react.' });
  }
}

export async function getMyReviews(req, res) {
  try {
    const user = req.user;

    // User's own reviews with plantation info and replies
    const reviewsResult = await pool.query(
      `SELECT r.*, p.name AS plantation_name, p.main_image_url AS plantation_image
       FROM reviews r
       JOIN plantations p ON p.id = r.plantation_id
       WHERE r.tourist_id = $1
       ORDER BY r.created_at DESC`,
      [user.id]
    );

    const reviewIds = reviewsResult.rows.map((r) => r.id);
    const repliesResult = reviewIds.length
      ? await pool.query(
          `SELECT rr.*
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

    const reviews = reviewsResult.rows.map((r) => ({
      ...r,
      replies: repliesByReview[r.id] || [],
    }));

    // User's replies on other people's reviews
    const myRepliesResult = await pool.query(
      `SELECT rr.id, rr.review_id, rr.content, rr.created_at, rr.author_role,
              r.content AS review_content, r.rating AS review_rating,
              p.name AS plantation_name, p.id AS plantation_id
       FROM review_replies rr
       JOIN reviews r ON r.id = rr.review_id
       JOIN plantations p ON p.id = r.plantation_id
       WHERE rr.author_id = $1
       ORDER BY rr.created_at DESC`,
      [user.id]
    );

    return res.status(200).json({
      data: {
        reviews,
        myReplies: myRepliesResult.rows,
      },
    });
  } catch (error) {
    console.error('getMyReviews error:', error);
    return res.status(500).json({ error: 'Failed to fetch your reviews.' });
  }
}
