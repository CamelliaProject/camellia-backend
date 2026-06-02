import pool from '../config/db.js';

export async function createContactRequest(req, res) {
  const { name, email, subject, message } = req.body;
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO contact_requests (name, email, subject, message)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [name.trim(), email.trim(), subject?.trim() || null, message.trim()]
    );
    return res.status(201).json({ ok: true, id: rows[0].id });
  } catch (error) {
    console.error('createContactRequest error:', error);
    return res.status(500).json({ error: 'Failed to submit contact request.' });
  }
}

export async function getContactRequests(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM contact_requests ORDER BY created_at DESC`
    );
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('getContactRequests error:', error);
    return res.status(500).json({ error: 'Failed to fetch contact requests.' });
  }
}

export async function resolveContactRequest(req, res) {
  const { id } = req.params;
  const { resolved_message } = req.body;
  try {
    await pool.query(
      `UPDATE contact_requests
       SET status = 'resolved', resolved_by = $1, resolved_message = $2, updated_at = now()
       WHERE id = $3`,
      [req.user.id, resolved_message?.trim() || null, id]
    );
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('resolveContactRequest error:', error);
    return res.status(500).json({ error: 'Failed to resolve contact request.' });
  }
}
