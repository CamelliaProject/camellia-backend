-- Migration 004: Store PayHere payment_id on bookings for refund processing
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payhere_payment_id VARCHAR(255);
