import pool from '../config/db.js';

export async function createPlantationRequest(req, res) {
  try {
    const { name, ownerName, businessReg, address, telephone, email, description } = req.body;

    if (!name || !ownerName || !businessReg || !address || !telephone || !email) {
      return res.status(400).json({ error: 'Missing required plantation request fields.' });
    }

    const insertQuery = `
      INSERT INTO plantation_requests (
        name,
        owner_name,
        business_registration,
        address,
        telephone,
        email,
        description,
        status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `;

    const values = [name, ownerName, businessReg, address, telephone, email, description || null, 'pending'];
    const { rows } = await pool.query(insertQuery, values);

    return res.status(201).json({ data: rows[0] });
  } catch (error) {
    console.error('createPlantationRequest error:', error);
    return res.status(500).json({ error: 'Failed to create plantation request.' });
  }
}

export async function getPendingPlantationRequests(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, owner_name, business_registration, address, telephone, email, description, status, approved_by, rejection_reason, created_at, updated_at, approved_at
       FROM plantation_requests
       WHERE status = 'pending'
       ORDER BY created_at DESC`
    );

    return res.status(200).json({ requests: rows });
  } catch (error) {
    console.error('getPendingPlantationRequests error:', error);
    return res.status(500).json({ error: 'Failed to fetch pending plantation requests.' });
  }
}

export async function approvePlantationRequest(req, res) {
  try {
    const { requestId } = req.params;
    const { adminUsername, adminPassword } = req.body;

    if (!requestId || !adminUsername || !adminPassword) {
      return res.status(400).json({ error: 'Request id, admin username, and admin password are required.' });
    }

    const requestResult = await pool.query('SELECT * FROM plantation_requests WHERE id = $1', [requestId]);
    if (!requestResult.rows.length) {
      return res.status(404).json({ error: 'Plantation request not found.' });
    }

    const request = requestResult.rows[0];
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Plantation request is not pending.' });
    }

    const plantationResult = await pool.query(
      `INSERT INTO plantations (
        name,
        address,
        description,
        phone,
        email
      ) VALUES ($1,$2,$3,$4,$5)
      RETURNING *`,
      [request.name, request.address, request.description || null, request.telephone, request.email]
    );

    const plantation = plantationResult.rows[0];

    const userResult = await pool.query(
      `INSERT INTO users (username, name, email, password_hash, role, plantation_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, now(), now())
       RETURNING *`,
      [adminUsername, request.owner_name, request.email, adminPassword, 'plantationadmin', plantation.id]
    );

    const user = userResult.rows[0];

    const approveResult = await pool.query(
      `UPDATE plantation_requests
       SET status = 'approved', approved_by = $1, approved_at = now(), updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [user.id, requestId]
    );

    return res.status(200).json({ data: { request: approveResult.rows[0], plantation, adminUser: user } });
  } catch (error) {
    console.error('approvePlantationRequest error:', error);
    return res.status(500).json({ error: 'Failed to approve plantation request.' });
  }
}
