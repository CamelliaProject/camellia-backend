-- Migration: Add time_slot_id to booking_experiences
-- Run this once against the live database.

ALTER TABLE booking_experiences
  ADD COLUMN IF NOT EXISTS time_slot_id UUID REFERENCES time_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booking_experiences_time_slot_id
  ON booking_experiences(time_slot_id);
