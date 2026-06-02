-- Migration 005: Make booking_time nullable (time slot selection removed)
ALTER TABLE bookings
  ALTER COLUMN booking_time DROP NOT NULL;
