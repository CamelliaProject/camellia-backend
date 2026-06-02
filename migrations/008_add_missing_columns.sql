-- plantation_requests: columns used by plantationRequestController
ALTER TABLE plantation_requests
  ADD COLUMN IF NOT EXISTS subscription_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS plantation_image_url TEXT,
  ADD COLUMN IF NOT EXISTS proof_document_url TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;

-- plantations: is_published used by getAllPlantationsForAdmin (super admin view)
ALTER TABLE plantations
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE;
