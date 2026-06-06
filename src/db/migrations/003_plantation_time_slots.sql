-- Plantation-level recurring time slots (one set applies to all experiences)
CREATE TABLE IF NOT EXISTS plantation_time_slots (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plantation_id UUID        NOT NULL REFERENCES plantations(id) ON DELETE CASCADE,
  day_of_week   SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  slot_time     TIME        NOT NULL,
  capacity      INT         NOT NULL DEFAULT 20,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  UNIQUE (plantation_id, day_of_week, slot_time)
);
