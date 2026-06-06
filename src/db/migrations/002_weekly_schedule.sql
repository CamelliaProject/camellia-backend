-- Migration 002: Weekly recurring schedule system
-- Replaces per-date time_slots with a weekly schedule per experience.
-- Run once on the live database.

-- ── Weekly time slots per experience (recurring by day-of-week) ─────────────
-- day_of_week: 0=Sunday 1=Monday 2=Tuesday 3=Wednesday 4=Thursday 5=Friday 6=Saturday
CREATE TABLE IF NOT EXISTS experience_weekly_slots (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  experience_id UUID NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  slot_time    TIME NOT NULL,
  capacity     INT  NOT NULL CHECK (capacity > 0),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (experience_id, day_of_week, slot_time)
);

CREATE INDEX IF NOT EXISTS idx_exp_weekly_slots_exp ON experience_weekly_slots(experience_id);
CREATE INDEX IF NOT EXISTS idx_exp_weekly_slots_day ON experience_weekly_slots(day_of_week);

-- ── Plantation-level days that are always closed (e.g. every Sunday) ────────
CREATE TABLE IF NOT EXISTS plantation_unavailable_days (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plantation_id UUID NOT NULL REFERENCES plantations(id) ON DELETE CASCADE,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  UNIQUE (plantation_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_unavail_days_plantation ON plantation_unavailable_days(plantation_id);

-- ── Specific closing dates (holidays, maintenance, etc.) ────────────────────
CREATE TABLE IF NOT EXISTS plantation_closing_dates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plantation_id UUID NOT NULL REFERENCES plantations(id) ON DELETE CASCADE,
  close_date    DATE NOT NULL,
  reason        VARCHAR(255),
  UNIQUE (plantation_id, close_date)
);

CREATE INDEX IF NOT EXISTS idx_closing_dates_plantation ON plantation_closing_dates(plantation_id);
CREATE INDEX IF NOT EXISTS idx_closing_dates_date       ON plantation_closing_dates(close_date);

-- ── bookings.booking_time: make nullable so existing rows don't break ────────
ALTER TABLE bookings ALTER COLUMN booking_time DROP NOT NULL;
