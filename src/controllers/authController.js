import crypto from 'crypto';
import pool from '../config/db.js';
import admin from '../services/firebaseAdmin.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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

export async function forgotPlantationAdminPassword(req, res) {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ error: 'Username is required.' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.name, p.email AS real_email
       FROM users u
       JOIN plantations p ON p.id = u.plantation_id
       WHERE u.username = $1 AND u.role = 'plantationadmin'
       LIMIT 1`,
      [username.trim()]
    );

    // Always return a generic response — don't reveal whether the username exists.
    const genericResponse = { success: true, message: 'If that account exists, a reset link has been sent to its registered email.' };

    if (!rows.length || !rows[0].real_email) {
      return res.status(200).json(genericResponse);
    }

    const user = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await pool.query(
      `UPDATE users SET reset_token_hash = $1, reset_token_expires = $2, updated_at = now() WHERE id = $3`,
      [tokenHash, expires, user.id]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/plantationadmin/reset-password?token=${token}`;
    sendPasswordResetEmail(user.real_email, user.name || 'Plantation Admin', resetUrl)
      .catch(err => console.error('Password reset email failed:', err.message));

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error('forgotPlantationAdminPassword error:', error);
    return res.status(500).json({ error: 'Failed to process request.' });
  }
}

export async function resetPlantationAdminPassword(req, res) {
  try {
    const { token, newPassword } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Reset token is required.' });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const tokenHash = hashToken(token);
    const { rows } = await pool.query(
      `SELECT id FROM users
       WHERE reset_token_hash = $1 AND reset_token_expires > now() AND role = 'plantationadmin'
       LIMIT 1`,
      [tokenHash]
    );

    if (!rows.length) {
      return res.status(400).json({ error: 'Invalid or expired reset link.' });
    }

    await pool.query(
      `UPDATE users
       SET password_hash = $1, password_changed = true, reset_token_hash = NULL, reset_token_expires = NULL, updated_at = now()
       WHERE id = $2`,
      [newPassword, rows[0].id]
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('resetPlantationAdminPassword error:', error);
    return res.status(500).json({ error: 'Failed to reset password.' });
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
