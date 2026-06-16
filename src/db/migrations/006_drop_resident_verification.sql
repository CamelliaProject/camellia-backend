-- Reverts 005_add_resident_verification.sql — the gate check-in checkbox
-- was removed in favor of tourist-side warnings only.
ALTER TABLE bookings
  DROP COLUMN IF EXISTS resident_verified,
  DROP COLUMN IF EXISTS resident_verified_at,
  DROP COLUMN IF EXISTS resident_verified_by;
