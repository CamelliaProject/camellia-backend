-- Migration 002: Allow tourists with completed bookings to reply to reviews
-- Previously, only plantation admins could reply (plantation_admin_id NOT NULL).
-- Now any verified user (admin or experienced tourist) can reply.

-- Step 1: Drop NOT NULL constraint on plantation_admin_id
ALTER TABLE review_replies
  ALTER COLUMN plantation_admin_id DROP NOT NULL;

-- Step 2: Add generic author tracking columns
ALTER TABLE review_replies
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS author_role VARCHAR(50) DEFAULT 'plantationadmin';

-- Step 3: Backfill author_id and author_role from existing plantation_admin replies
UPDATE review_replies
SET
  author_id  = plantation_admin_id,
  author_role = 'plantationadmin'
WHERE plantation_admin_id IS NOT NULL
  AND author_id IS NULL;

-- Step 4: Index for performance
CREATE INDEX IF NOT EXISTS idx_review_replies_author_id ON review_replies(author_id);
