CREATE TABLE IF NOT EXISTS plantation_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plantation_id UUID NOT NULL REFERENCES plantations(id) ON DELETE CASCADE,
  plantation_request_id UUID REFERENCES plantation_requests(id),
  subscription_type VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  payhere_payment_id VARCHAR(255),
  reminder_1month_sent BOOLEAN DEFAULT FALSE,
  reminder_1week_sent  BOOLEAN DEFAULT FALSE,
  reminder_1day_sent   BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subs_plantation ON plantation_subscriptions(plantation_id);
CREATE INDEX IF NOT EXISTS idx_subs_end_date   ON plantation_subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_subs_status     ON plantation_subscriptions(status);
