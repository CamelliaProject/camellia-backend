-- Migration script to add Firebase fields to users table
-- Run this if your users table already exists

ALTER TABLE users ADD COLUMN IF NOT EXISTS uid VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT '';

-- Update existing records to have a default name if missing
UPDATE users SET name = username WHERE name IS NULL OR name = '';

-- Alter column to not allow null going forward
ALTER TABLE users ALTER COLUMN name SET NOT NULL;
