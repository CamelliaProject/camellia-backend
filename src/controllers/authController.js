import pool from '../config/db.js';

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
