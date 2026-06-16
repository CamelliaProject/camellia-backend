export const ROLES = {
  SUPER_ADMIN:       'superadmin',
  PLANTATION_ADMIN:  'plantationadmin',
  TOURIST:           'tourist',
};

export const BOOKING_STATUSES = {
  PENDING:    'pending',
  CONFIRMED:  'confirmed',
  CANCELLED:  'cancelled',
  COMPLETED:  'completed',
};

export const PLANTATION_REQUEST_STATUSES = {
  PENDING:   'pending',
  APPROVED:  'approved',
  REJECTED:  'rejected',
};

export const SUBSCRIPTION_AMOUNTS = {
  starter: 60000,
  pro:     150000,
};

export const SUBSCRIPTION_LABELS = {
  starter: 'Starter Pack (LKR 60,000/year)',
  pro:     'Pro Pack (LKR 150,000/year)',
};

// Starter plan is capped at 1,000 bookings per subscription year; Pro is unlimited.
export const STARTER_BOOKING_LIMIT = 1000;
