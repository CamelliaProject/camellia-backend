import pool from '../config/db.js';
import { uploadFile } from '../services/storageService.js';
import {
  sendSubmissionConfirmation,
  sendApprovalCredentials,
  sendRejectionNotice,
  sendSubscriptionPaymentEmail,
} from '../services/emailService.js';

const SUBSCRIPTION_AMOUNTS = { starter: 24000, pro: 60000 };
const SUBSCRIPTION_LABELS  = { starter: 'Starter Pack (LKR 24,000/year)', pro: 'Pro Pack (LKR 60,000/year)' };

// ── Helpers ────────────────────────────────────────────────────────────────

function generateUsername(plantationName) {
  const slug = plantationName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${slug}_${rand}`;
}

function generatePassword() {
  const upper   = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '@#$!';
  const pool    = upper + lower + digits + special;

  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  const rest = Array.from({ length: 8 }, () => pool[Math.floor(Math.random() * pool.length)]);

  return [...required, ...rest].sort(() => Math.random() - 0.5).join('');
}

// ── Controllers ────────────────────────────────────────────────────────────

export async function createPlantationRequest(req, res) {
  try {
    const {
      name, ownerName, businessReg, address,
      telephone, email, description, subscriptionType,
    } = req.body;

    if (!name || !ownerName || !businessReg || !address || !telephone || !email || !subscriptionType) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (!['starter', 'pro'].includes(subscriptionType)) {
      return res.status(400).json({ error: 'Invalid subscription type.' });
    }

    // Upload plantation image (optional)
    let plantationImageUrl = null;
    if (req.files?.plantationImage?.[0]) {
      plantationImageUrl = await uploadFile(
        req.files.plantationImage[0].buffer,
        { folder: 'camellia/plantation-requests/images', resourceType: 'image' }
      );
    }

    // Upload proof document (required)
    if (!req.files?.proofDocument?.[0]) {
      return res.status(400).json({ error: 'Proof document is required.' });
    }
    const proofDocumentUrl = await uploadFile(
      req.files.proofDocument[0].buffer,
      { folder: 'camellia/plantation-requests/documents', resourceType: 'auto' }
    );

    const { rows } = await pool.query(
      `INSERT INTO plantation_requests
         (name, owner_name, business_registration, address, telephone, email,
          description, subscription_type, plantation_image_url, proof_document_url, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
       RETURNING *`,
      [name, ownerName, businessReg, address, telephone, email,
       description || null, subscriptionType, plantationImageUrl, proofDocumentUrl]
    );

    // Fire-and-forget confirmation email
    sendSubmissionConfirmation(email, ownerName, name).catch(err =>
      console.error('Confirmation email failed:', err.message)
    );

    return res.status(201).json({ data: rows[0] });
  } catch (error) {
    console.error('createPlantationRequest error:', error);
    if (error.code === '23505') {
      if (error.constraint?.includes('business_registration')) {
        return res.status(409).json({ error: 'This business registration number has already been submitted. If you need to resubmit, please contact support.' });
      }
      if (error.constraint?.includes('plantation_requests') && error.constraint?.includes('name')) {
        return res.status(409).json({ error: 'A plantation with this name has already been registered.' });
      }
    }
    return res.status(500).json({ error: 'Failed to submit registration request.' });
  }
}

export async function getPendingPlantationRequests(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, owner_name, business_registration, address, telephone, email,
              description, status, approved_by, rejection_reason, created_at, updated_at, approved_at,
              -- columns added by ALTER TABLE (may be null if migration not yet run)
              subscription_type, plantation_image_url, proof_document_url
       FROM plantation_requests
       WHERE status = 'pending'
       ORDER BY created_at DESC`
    );
    return res.status(200).json({ requests: rows });
  } catch (error) {
    console.error('getPendingPlantationRequests error:', error);
    // Return the real DB error in the response so it's visible in browser dev-tools
    return res.status(500).json({
      error: 'Failed to fetch pending requests.',
      detail: error.message,
      hint: 'Run the ALTER TABLE migration — see README or previous setup instructions.',
    });
  }
}

export async function approvePlantationRequest(req, res) {
  const client = await pool.connect();
  try {
    const { requestId } = req.params;

    const { rows: reqRows } = await client.query(
      'SELECT * FROM plantation_requests WHERE id = $1',
      [requestId]
    );
    if (!reqRows.length) return res.status(404).json({ error: 'Request not found.' });

    const request = reqRows[0];
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending.' });
    }

    await client.query('BEGIN');

    // Auto-generate unique username (retry up to 5 times on collision)
    let username;
    for (let i = 0; i < 5; i++) {
      const candidate = generateUsername(request.name);
      const { rows } = await client.query('SELECT id FROM users WHERE username = $1', [candidate]);
      if (!rows.length) { username = candidate; break; }
    }
    if (!username) throw new Error('Could not generate a unique username after 5 attempts.');

    const password = generatePassword();

    // Create plantation entry
    const { rows: plantRows } = await client.query(
      `INSERT INTO plantations (name, address, description, phone, email, main_image_url)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [request.name, request.address, request.description || null,
       request.telephone, request.email, request.plantation_image_url || null]
    );
    const plantation = plantRows[0];

    // Each plantation gets its own admin account with a synthetic system email.
    // This allows the same owner email to manage multiple plantations without
    // any unique-email conflicts. The owner's real email is only used to send
    // the credentials notification; it is never the admin login email.
    const adminEmail = `${username}@admin.camellia`;

    const { rows: userRows } = await client.query(
      `INSERT INTO users (username, name, email, password_hash, role, plantation_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'plantationadmin',$5, now(), now())
       RETURNING id, username, email, role, plantation_id`,
      [username, request.owner_name, adminEmail, password, plantation.id]
    );
    const adminUser = userRows[0];

    // Mark request as approved
    await client.query(
      `UPDATE plantation_requests
       SET status = 'approved', approved_by = $1, approved_at = now(), updated_at = now()
       WHERE id = $2`,
      [adminUser.id, requestId]
    );

    const subscriptionAmount = SUBSCRIPTION_AMOUNTS[request.subscription_type] || SUBSCRIPTION_AMOUNTS.starter;

    // Store linked IDs and subscription amount; mark payment as pending
    await client.query(
      `UPDATE plantation_requests
       SET linked_plantation_id = $1, linked_admin_user_id = $2,
           subscription_amount = $3, subscription_payment_status = 'pending_payment',
           updated_at = now()
       WHERE id = $4`,
      [plantation.id, adminUser.id, subscriptionAmount, requestId]
    );

    await client.query('COMMIT');

    // Send payment email (credentials come after payment)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const paymentUrl  = `${frontendUrl}/subscription-payment?token=${requestId}`;
    sendSubscriptionPaymentEmail(
      request.email, request.owner_name, request.name,
      SUBSCRIPTION_LABELS[request.subscription_type] || 'Starter Pack',
      subscriptionAmount, paymentUrl
    ).catch(err => console.error('Subscription payment email failed:', err.message));

    return res.status(200).json({ data: { plantation, adminUser } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('approvePlantationRequest error:', error);

    // Return a user-friendly message for known constraint violations
    if (error.code === '23505') {
      if (error.constraint?.includes('plantations_name')) {
        return res.status(409).json({ error: 'A plantation with this name already exists. Delete the orphan record from the plantations table and try again.' });
      }
      return res.status(409).json({ error: `Duplicate value conflict: ${error.detail || error.message}` });
    }

    return res.status(500).json({ error: 'Failed to approve request.', detail: error.message });
  } finally {
    client.release();
  }
}

export async function rejectPlantationRequest(req, res) {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;

    const { rows } = await pool.query(
      'SELECT * FROM plantation_requests WHERE id = $1',
      [requestId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Request not found.' });

    const request = rows[0];
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending.' });
    }

    await pool.query(
      `UPDATE plantation_requests
       SET status = 'rejected', rejection_reason = $1, rejected_at = now(), updated_at = now()
       WHERE id = $2`,
      [reason || null, requestId]
    );

    sendRejectionNotice(request.email, request.owner_name, request.name, reason).catch(err =>
      console.error('Rejection email failed:', err.message)
    );

    return res.status(200).json({ message: 'Request rejected.' });
  } catch (error) {
    console.error('rejectPlantationRequest error:', error);
    return res.status(500).json({ error: 'Failed to reject request.' });
  }
}
