-- Migration 006: Track who cancelled a booking (admin or tourist)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(20);
-- Values: 'admin' | 'tourist' | NULL (not cancelled)
