import pool from '../config/db.js';
import crypto from 'crypto';

export async function syncUser(req, res) {
  const { uid, identityId, name, email } = req.body;
  const uniqueId = uid || identityId;

  if (!uniqueId || !name || !email) {
    return res.status(400).json({
      error: 'Missing required user fields: uniqueId (uid or identityId), name, and email are required.',
    });
  }

  try {
    const selectQuery = `
      SELECT * FROM users
      WHERE uid = $1 OR identity_id = $1 OR email = $2
      LIMIT 1
    `;
    const selectResult = await pool.query(selectQuery, [uniqueId, email]);

    if (selectResult.rows.length > 0) {
      return res.status(200).json(selectResult.rows[0]);
    }

    const defaultRole = 'tourist';
    const username = email.split('@')[0] + '-' + crypto.randomBytes(3).toString('hex');
    const passwordHash = crypto.randomBytes(16).toString('hex');

    const insertQuery = `
      INSERT INTO users (uid, identity_id, username, email, password_hash, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, now(), now())
      RETURNING *
    `;

    const insertValues = [uid || null, identityId || null, username, email, passwordHash, defaultRole];
    const insertResult = await pool.query(insertQuery, insertValues);

    return res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    console.error('User sync error:', error);
    return res.status(500).json({ error: 'Failed to sync user record.' });
  }
}
