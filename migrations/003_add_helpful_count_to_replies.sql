-- Migration 003: Add helpful_count to review_replies for reactions
ALTER TABLE review_replies
  ADD COLUMN IF NOT EXISTS helpful_count INT DEFAULT 0;
