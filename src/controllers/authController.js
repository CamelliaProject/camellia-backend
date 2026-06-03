import pool from '../config/db.js';
import admin from '../services/firebaseAdmin.js';

export async function changePlantationAdminPassword(req, res) {
  try {
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    await pool.query(
      `UPDATE users
       SET password_hash = $1, password_changed = true, updated_at = now()
       WHERE id = $2`,
      [newPassword, req.user.id]
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('changePlantationAdminPassword error:', error);
    return res.status(500).json({ error: 'Failed to change password.' });
  }
}

export async function adminLogin(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ error: 'Username is required.' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required.' });
    }
    if (username.trim().length > 50) {
      return res.status(400).json({ error: 'Username is too long.' });
    }
    if (password.length > 128) {
      return res.status(400).json({ error: 'Password is too long.' });
    }

    const { rows } = await pool.query(
      `SELECT id, username, email, role, plantation_id, uid, password_changed
       FROM users
       WHERE username = $1 AND password_hash = $2
         AND role IN ('superadmin', 'plantationadmin')
       LIMIT 1`,
      [username.trim(), password]
    );

    if (!rows.length) {
      // Generic message — don't reveal whether username or password was wrong
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user = rows[0];

    // Use stored Firebase UID; fall back to the DB primary key so every admin
    // always has a stable, unique UID for the custom token.
    let firebaseUid = user.uid || user.id;

    if (!user.uid) {
      // Persist the UID so authMiddleware can find this user by uid in future requests.
      await pool.query('UPDATE users SET uid = $1, updated_at = now() WHERE id = $2', [firebaseUid, user.id]);
    }

    // Issue a Firebase Custom Token — the client exchanges this for a real ID token
    // via signInWithCustomToken(), after which all protected API calls work normally.
    const customToken = await admin.auth().createCustomToken(firebaseUid, { role: user.role });

    return res.status(200).json({
      customToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        plantationId: user.plantation_id,
        uid: firebaseUid,
        passwordChanged: user.password_changed || false,
      },
    });
  } catch (error) {
    console.error('adminLogin error:', error);
    return res.status(500).json({ error: 'Failed to log in.' });
  }
}
