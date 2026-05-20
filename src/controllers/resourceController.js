import pool from '../config/db.js';
import { uploadImage } from '../services/storageService.js';

// Change this to match your actual table name
const TABLE_NAME = 'resources';

/**
 * Get all active resources
 */
export async function getAll(req, res) {
  try {
    const query = `SELECT * FROM ${TABLE_NAME} WHERE is_active = true ORDER BY id`;
    const { rows } = await pool.query(query);
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('getAll error:', error);
    return res.status(500).json({ error: 'Failed to fetch resources.' });
  }
}

/**
 * Get a single resource by ID
 */
export async function getById(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing resource id parameter.' });

  try {
    const query = `SELECT * FROM ${TABLE_NAME} WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);

    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Resource not found.' });

    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('getById error:', error);
    return res.status(500).json({ error: 'Failed to fetch resource.' });
  }
}

/**
 * Create a new resource. Handles optional image upload via req.file.buffer
 */
export async function createResource(req, res) {
  try {
    const body = req.body || {};
    let imageUrl = null;

    if (req.file && req.file.buffer) {
      try {
        imageUrl = await uploadImage(req.file.buffer);
      } catch (uErr) {
        console.error('Image upload failed:', uErr);
        return res.status(500).json({ error: 'Image upload failed.' });
      }
    }

    const bodyKeys = Object.keys(body);
    const columns = [...bodyKeys];
    const values = [];

    // append image_url if present
    if (imageUrl) {
      columns.push('image_url');
    }

    if (columns.length === 0) {
      // No body fields, but maybe only image
      if (imageUrl) {
        const insertQuery = `INSERT INTO ${TABLE_NAME} (image_url) VALUES ($1) RETURNING *`;
        const { rows } = await pool.query(insertQuery, [imageUrl]);
        return res.status(201).json({ data: rows[0] });
      }

      return res.status(400).json({ error: 'No fields provided to create resource.' });
    }

    // prepare parameterized values in same order as columns
    for (let i = 0; i < bodyKeys.length; i++) {
      values.push(body[bodyKeys[i]]);
    }
    if (imageUrl) values.push(imageUrl);

    const placeholders = values.map((_, idx) => `$${idx + 1}`);
    const insertQuery = `INSERT INTO ${TABLE_NAME} (${columns.join(', ')}) VALUES (${placeholders.join(
      ', '
    )}) RETURNING *`;

    const { rows } = await pool.query(insertQuery, values);
    return res.status(201).json({ data: rows[0] });
  } catch (error) {
    console.error('createResource error:', error);
    return res.status(500).json({ error: 'Failed to create resource.' });
  }
}

/**
 * Update a resource by ID. Accepts body fields and optional file upload to replace image_url
 */
export async function updateResource(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing resource id parameter.' });

  try {
    const body = req.body || {};
    let imageUrl = null;

    if (req.file && req.file.buffer) {
      try {
        imageUrl = await uploadImage(req.file.buffer);
      } catch (uErr) {
        console.error('Image upload failed during update:', uErr);
        return res.status(500).json({ error: 'Image upload failed.' });
      }
    }

    const updates = [];
    const values = [];

    const bodyKeys = Object.keys(body);
    for (let i = 0; i < bodyKeys.length; i++) {
      updates.push(`${bodyKeys[i]} = $${values.length + 1}`);
      values.push(body[bodyKeys[i]]);
    }

    if (imageUrl) {
      updates.push(`image_url = $${values.length + 1}`);
      values.push(imageUrl);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No update fields provided.' });
    }

    // add id as last param
    values.push(id);
    const updateQuery = `UPDATE ${TABLE_NAME} SET ${updates.join(', ')}, updated_at = now() WHERE id = $${
      values.length
    } RETURNING *`;

    const { rows } = await pool.query(updateQuery, values);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Resource not found.' });

    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('updateResource error:', error);
    return res.status(500).json({ error: 'Failed to update resource.' });
  }
}

/**
 * Soft-delete a resource by setting is_active = false
 */
export async function deleteResource(req, res) {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing resource id parameter.' });

  try {
    const deleteQuery = `UPDATE ${TABLE_NAME} SET is_active = false, updated_at = now() WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(deleteQuery, [id]);

    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Resource not found.' });

    return res.status(200).json({ data: rows[0] });
  } catch (error) {
    console.error('deleteResource error:', error);
    return res.status(500).json({ error: 'Failed to delete resource.' });
  }
}

export default {
  getAll,
  getById,
  createResource,
  updateResource,
  deleteResource,
};
