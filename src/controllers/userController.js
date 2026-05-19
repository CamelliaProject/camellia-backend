import pool from '../config/db.js';

export async function syncUser(req, res) {
  const { identityId, name, email } = req.body;

  if (!identityId || !name || !email) {
    return res.status(400).json({
      error: 'Missing required user fields: identityId, name, and email are required.',
    });
  }

  try {
    const selectQuery = 'SELECT * FROM users WHERE identity_id = $1';
    const selectResult = await pool.query(selectQuery, [identityId]);

    if (selectResult.rows.length > 0) {
      return res.status(200).json(selectResult.rows[0]);
    }

    const insertQuery = `
      INSERT INTO users (identity_id, name, email, role)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const defaultRole = 'tourist';
    const insertResult = await pool.query(insertQuery, [identityId, name, email, defaultRole]);

    return res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    console.error('User sync error:', error);
    return res.status(500).json({ error: 'Failed to sync user record.' });
  }
}
