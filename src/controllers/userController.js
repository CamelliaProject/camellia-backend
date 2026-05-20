import pool from '../config/db.js';

export async function syncUser(req, res) {
  // Accept either `uid` (Firebase) or `identityId` from the frontend
  const { uid, identityId, name, email } = req.body;
  const uniqueId = uid || identityId;

  if (!uniqueId || !name || !email) {
    return res.status(400).json({
      error: 'Missing required user fields: uniqueId (uid or identityId), name, and email are required.',
    });
  }

  try {
    // Check for existing user by uid, identity_id, or email (parameterized)
    const selectQuery = `
      SELECT * FROM users
      WHERE uid = $1 OR identity_id = $1 OR email = $2
      LIMIT 1
    `;
    const selectResult = await pool.query(selectQuery, [uniqueId, email]);

    if (selectResult.rows.length > 0) {
      return res.status(200).json(selectResult.rows[0]);
    }

    // Create a new user with a default role
    const insertQuery = `
      INSERT INTO users (uid, identity_id, name, email, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const defaultRole = 'tourist';
    const insertValues = [uid || null, identityId || null, name, email, defaultRole];

    const insertResult = await pool.query(insertQuery, insertValues);

    return res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    console.error('User sync error:', error);
    return res.status(500).json({ error: 'Failed to sync user record.' });
  }
}
