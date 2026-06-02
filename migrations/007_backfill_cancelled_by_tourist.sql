-- All bookings cancelled before the cancelled_by column was introduced
-- were tourist-initiated (admin cancel didn't exist yet).
UPDATE bookings
SET cancelled_by = 'tourist'
WHERE status = 'cancelled'
  AND cancelled_by IS NULL;
