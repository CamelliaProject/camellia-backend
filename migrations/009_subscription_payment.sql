ALTER TABLE plantation_requests
  ADD COLUMN IF NOT EXISTS subscription_payment_status VARCHAR(20) DEFAULT 'pending_payment',
  ADD COLUMN IF NOT EXISTS subscription_amount INTEGER,
  ADD COLUMN IF NOT EXISTS linked_plantation_id UUID REFERENCES plantations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
