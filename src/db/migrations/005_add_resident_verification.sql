-- Track whether a plantation admin has physically verified a "Sri Lankan
-- Resident" booking's NIC against the guest at check-in.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS resident_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resident_verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS resident_verified_by UUID REFERENCES users(id) ON DELETE SET NULL;
