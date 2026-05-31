import pool from '../config/db.js';
import admin from '../services/firebaseAdmin.js';

const otpStore = new Map();
const resetStore = new Map();

export async function sendOtp(req, res) {
  try {
    const { username, email } = req.body;
    if (!username || !email) {
      return res.status(400).json({ error: 'Username and email are required.' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    otpStore.set(username, { code, expiresAt, email });
    return res.status(200).json({ success: true, code: code });
  } catch (error) {
    console.error('sendOtp error:', error);
    return res.status(500).json({ error: 'Failed to send OTP.' });
  }
}

export async function verifyOtp(req, res) {
  try {
    const { username, code } = req.body;
    if (!username || !code) {
      return res.status(400).json({ error: 'Username and OTP code are required.' });
    }

    const entry = otpStore.get(username);
    if (!entry) {
      return res.status(400).json({ error: 'No OTP requested for this user.' });
    }
    if (Date.now() > entry.expiresAt) {
      otpStore.delete(username);
      return res.status(400).json({ error: 'OTP has expired.' });
    }
    if (entry.code !== code) {
      return res.status(400).json({ error: 'Invalid OTP.' });
    }

    resetStore.set(username, { allowed: true, expiresAt: Date.now() + 10 * 60 * 1000 });
    otpStore.delete(username);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('verifyOtp error:', error);
    return res.status(500).json({ error: 'Failed to verify OTP.' });
  }
}

export async function resetPassword(req, res) {
  try {
    const { username, newPassword } = req.body;
    if (!username || !newPassword) {
      return res.status(400).json({ error: 'Username and new password are required.' });
    }

    const resetEntry = resetStore.get(username);
    if (!resetEntry || Date.now() > resetEntry.expiresAt) {
      return res.status(403).json({ error: 'Password reset not authorized or has expired.' });
    }

    const result = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = now() WHERE username = $2 RETURNING *',
      [newPassword, username]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'User not found.' });
    }

    resetStore.delete(username);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('resetPassword error:', error);
    return res.status(500).json({ error: 'Failed to reset password.' });
  }
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
      `SELECT id, username, email, role, plantation_id, uid
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
      },
    });
  } catch (error) {
    console.error('adminLogin error:', error);
    return res.status(500).json({ error: 'Failed to log in.' });
  }
}
