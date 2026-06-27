
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations() {
  const client = await pool.connect();
  try {
    // Create tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename  TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Find all numbered migration files
    const migDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migDir)) return;

    const files = fs.readdirSync(migDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (rows.length) continue; // already applied

      const sql = fs.readFileSync(path.join(migDir, file), 'utf8');
      console.log(`[migrate] applying ${file}…`);
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      console.log(`[migrate] ${file} applied.`);
    }
  } catch (err) {
    console.error('[migrate] Migration failed:', err.message);
    throw err; // bubble up so server doesn't start with a broken schema
  } finally {
    client.release();
  }
}
