-- Camellia Tea Tourism Platform - PostgreSQL Database Schema
-- Database: camelliadb
-- Created for production deployment

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS AND AUTHENTICATION
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uid VARCHAR(255) UNIQUE,
    identity_id VARCHAR(255) UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('superadmin', 'plantationadmin', 'tourist')),
    is_active BOOLEAN DEFAULT TRUE,
    plantation_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_plantation_id ON users(plantation_id);

-- ============================================================================
-- PLANTATION REQUESTS (Registration Workflow)
-- ============================================================================

CREATE TABLE plantation_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    business_registration VARCHAR(100) NOT NULL UNIQUE,
    address TEXT NOT NULL,
    telephone VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_plantation_requests_status ON plantation_requests(status);
CREATE INDEX idx_plantation_requests_created_at ON plantation_requests(created_at DESC);

-- ============================================================================
-- PLANTATIONS
-- ============================================================================

CREATE TABLE plantations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    address TEXT NOT NULL,
    description TEXT,
    detailed_description TEXT,
    best_time_to_visit TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    altitude VARCHAR(100),
    area VARCHAR(100),
    established_year INT,
    main_image_url TEXT,
    rating DECIMAL(3, 2) DEFAULT 0,
    total_reviews INT DEFAULT 0,
    is_disabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plantations_name ON plantations(name);
CREATE INDEX idx_plantations_rating ON plantations(rating DESC);
CREATE INDEX idx_plantations_is_disabled ON plantations(is_disabled);

-- Add foreign key to users table
ALTER TABLE users ADD CONSTRAINT fk_users_plantation_id FOREIGN KEY (plantation_id) REFERENCES plantations(id) ON DELETE SET NULL;

-- ============================================================================
-- PLANTATION GALLERY IMAGES
-- ============================================================================

CREATE TABLE plantation_gallery_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plantation_id UUID NOT NULL REFERENCES plantations(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plantation_gallery_images_plantation_id ON plantation_gallery_images(plantation_id);

-- ============================================================================
-- EXPERIENCES
-- ============================================================================

CREATE TABLE experiences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plantation_id UUID NOT NULL REFERENCES plantations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    short_description TEXT,
    detailed_description TEXT,
    category VARCHAR(100),
    announcement TEXT,
    price_usd_adult DECIMAL(10, 2),
    price_usd_child DECIMAL(10, 2),
    price_lkr_adult DECIMAL(12, 2),
    price_lkr_child DECIMAL(12, 2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plantation_id, name)
);

CREATE INDEX idx_experiences_plantation_id ON experiences(plantation_id);
CREATE INDEX idx_experiences_is_active ON experiences(is_active);

-- ============================================================================
-- EXPERIENCE IMAGES
-- ============================================================================

CREATE TABLE experience_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    experience_id UUID NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_experience_images_experience_id ON experience_images(experience_id);

-- ============================================================================
-- TIME SLOTS (Availability)
-- ============================================================================

CREATE TABLE time_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    experience_id UUID NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    slot_time TIME NOT NULL,
    capacity INT NOT NULL,
    booked INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(experience_id, slot_date, slot_time),
    CONSTRAINT capacity_check CHECK (capacity > 0 AND booked >= 0 AND booked <= capacity)
);

CREATE INDEX idx_time_slots_experience_id ON time_slots(experience_id);
CREATE INDEX idx_time_slots_date ON time_slots(slot_date);
CREATE INDEX idx_time_slots_date_time ON time_slots(slot_date, slot_time);

-- ============================================================================
-- BOOKINGS
-- ============================================================================

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_reference VARCHAR(50) NOT NULL UNIQUE,
    plantation_id UUID NOT NULL REFERENCES plantations(id) ON DELETE RESTRICT,
    tourist_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    booking_date DATE NOT NULL,
    booking_time TIME NOT NULL,
    num_adults INT NOT NULL DEFAULT 1,
    num_children INT DEFAULT 0,
    total_price_usd DECIMAL(10, 2),
    total_price_lkr DECIMAL(12, 2),
    usd_to_lkr_rate DECIMAL(10, 4),
    status VARCHAR(50) NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'cancelled')),
    tourist_full_name VARCHAR(255),
    tourist_email VARCHAR(255),
    tourist_phone VARCHAR(20),
    tourist_country VARCHAR(100),
    special_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bookings_plantation_id ON bookings(plantation_id);
CREATE INDEX idx_bookings_tourist_id ON bookings(tourist_id);
CREATE INDEX idx_bookings_booking_reference ON bookings(booking_reference);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_booking_date ON bookings(booking_date);

-- ============================================================================
-- BOOKING EXPERIENCES (Many-to-Many Relationship)
-- ============================================================================

CREATE TABLE booking_experiences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    experience_id UUID NOT NULL REFERENCES experiences(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(booking_id, experience_id)
);

CREATE INDEX idx_booking_experiences_booking_id ON booking_experiences(booking_id);
CREATE INDEX idx_booking_experiences_experience_id ON booking_experiences(experience_id);

-- ============================================================================
-- PAYMENTS
-- ============================================================================

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_reference VARCHAR(50) NOT NULL UNIQUE,
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    plantation_id UUID NOT NULL REFERENCES plantations(id) ON DELETE RESTRICT,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL CHECK (currency IN ('USD', 'LKR')),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
    payment_method VARCHAR(100),
    transaction_id VARCHAR(255),
    payment_date TIMESTAMP WITH TIME ZONE,
    refund_date TIMESTAMP WITH TIME ZONE,
    refund_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payments_booking_id ON payments(booking_id);
CREATE INDEX idx_payments_plantation_id ON payments(plantation_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_payment_reference ON payments(payment_reference);
CREATE INDEX idx_payments_payment_date ON payments(payment_date DESC);

-- ============================================================================
-- REVIEWS
-- ============================================================================

CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plantation_id UUID NOT NULL REFERENCES plantations(id) ON DELETE CASCADE,
    tourist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    content TEXT NOT NULL,
    image_url TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    helpful_count INT DEFAULT 0,
    unhelpful_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reviews_plantation_id ON reviews(plantation_id);
CREATE INDEX idx_reviews_tourist_id ON reviews(tourist_id);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_reviews_is_verified ON reviews(is_verified);
CREATE INDEX idx_reviews_created_at ON reviews(created_at DESC);

-- ============================================================================
-- REVIEW REPLIES
-- ============================================================================

CREATE TABLE review_replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    plantation_admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_name VARCHAR(255),
    content TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_review_replies_review_id ON review_replies(review_id);
CREATE INDEX idx_review_replies_plantation_admin_id ON review_replies(plantation_admin_id);
CREATE INDEX idx_review_replies_created_at ON review_replies(created_at DESC);

-- ============================================================================
-- CONTACT REQUESTS
-- ============================================================================

CREATE TABLE contact_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    message TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contact_requests_status ON contact_requests(status);
CREATE INDEX idx_contact_requests_email ON contact_requests(email);
CREATE INDEX idx_contact_requests_created_at ON contact_requests(created_at DESC);

-- ============================================================================
-- ADMIN ACCOUNTS (Plantation Admin Credentials)
-- ============================================================================

CREATE TABLE plantation_admin_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plantation_id UUID NOT NULL REFERENCES plantations(id) ON DELETE CASCADE,
    password_changed BOOLEAN DEFAULT FALSE,
    temporary_password VARCHAR(255),
    password_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, plantation_id)
);

CREATE INDEX idx_plantation_admin_accounts_user_id ON plantation_admin_accounts(user_id);
CREATE INDEX idx_plantation_admin_accounts_plantation_id ON plantation_admin_accounts(plantation_id);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- ACTIVITY LOGS (For Debugging and Monitoring)
-- ============================================================================

CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level VARCHAR(20) NOT NULL CHECK (level IN ('INFO', 'WARNING', 'ERROR', 'DEBUG')),
    message TEXT NOT NULL,
    context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_logs_level ON activity_logs(level);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- ============================================================================
-- ANALYTICS - Booking Statistics
-- ============================================================================

CREATE TABLE booking_statistics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plantation_id UUID NOT NULL REFERENCES plantations(id) ON DELETE CASCADE,
    statistic_date DATE NOT NULL,
    total_bookings INT DEFAULT 0,
    completed_bookings INT DEFAULT 0,
    cancelled_bookings INT DEFAULT 0,
    total_revenue_usd DECIMAL(12, 2) DEFAULT 0,
    total_revenue_lkr DECIMAL(14, 2) DEFAULT 0,
    avg_rating DECIMAL(3, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plantation_id, statistic_date)
);

CREATE INDEX idx_booking_statistics_plantation_id ON booking_statistics(plantation_id);
CREATE INDEX idx_booking_statistics_statistic_date ON booking_statistics(statistic_date DESC);

-- ============================================================================
-- INITIAL DATA CONSTRAINTS AND VIEWS
-- ============================================================================

-- View: Active Experiences with Available Slots
CREATE VIEW v_active_experiences_with_slots AS
SELECT 
    e.id,
    e.plantation_id,
    e.name,
    e.category,
    e.price_usd_adult,
    e.price_usd_child,
    e.price_lkr_adult,
    e.price_lkr_child,
    COUNT(DISTINCT ts.id) as available_slots_count,
    SUM(CASE WHEN ts.booked < ts.capacity THEN 1 ELSE 0 END) as open_slots_count
FROM experiences e
LEFT JOIN time_slots ts ON e.id = ts.experience_id
WHERE e.is_active = TRUE
    AND ts.slot_date >= CURRENT_DATE
GROUP BY e.id, e.plantation_id, e.name, e.category, 
         e.price_usd_adult, e.price_usd_child, 
         e.price_lkr_adult, e.price_lkr_child;

-- View: Plantation Summary with Stats
CREATE VIEW v_plantation_summary AS
SELECT 
    p.id,
    p.name,
    p.address,
    p.rating,
    p.total_reviews,
    COUNT(DISTINCT b.id) as total_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END) as completed_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'upcoming' THEN b.id END) as upcoming_bookings,
    COUNT(DISTINCT r.id) as review_count,
    COUNT(DISTINCT e.id) as experience_count
FROM plantations p
LEFT JOIN bookings b ON p.id = b.plantation_id
LEFT JOIN reviews r ON p.id = r.plantation_id
LEFT JOIN experiences e ON p.id = e.plantation_id
WHERE p.is_disabled = FALSE
GROUP BY p.id, p.name, p.address, p.rating, p.total_reviews;

-- View: Tourist Booking History
CREATE VIEW v_tourist_booking_history AS
SELECT 
    b.id,
    b.booking_reference,
    b.plantation_id,
    p.name as plantation_name,
    b.tourist_id,
    u.username as tourist_username,
    b.booking_date,
    b.booking_time,
    b.num_adults,
    b.num_children,
    b.total_price_usd,
    b.total_price_lkr,
    b.status,
    STRING_AGG(DISTINCT e.name, ', ') as experiences,
    b.created_at
FROM bookings b
JOIN plantations p ON b.plantation_id = p.id
JOIN users u ON b.tourist_id = u.id
LEFT JOIN booking_experiences be ON b.id = be.booking_id
LEFT JOIN experiences e ON be.experience_id = e.id
GROUP BY b.id, b.booking_reference, b.plantation_id, p.name, 
         b.tourist_id, u.username, b.booking_date, b.booking_time,
         b.num_adults, b.num_children, b.total_price_usd, b.total_price_lkr,
         b.status, b.created_at;

-- ============================================================================
-- COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE users IS 'Core user table for all three user types: superadmin, plantationadmin, tourist';
COMMENT ON TABLE plantations IS 'Tea plantation businesses offering experiences';
COMMENT ON TABLE experiences IS 'Activities/tours offered by plantations (e.g., Tea Factory Tour)';
COMMENT ON TABLE time_slots IS 'Available date/time slots for each experience';
COMMENT ON TABLE bookings IS 'Tourist bookings with guest details and pricing';
COMMENT ON TABLE payments IS 'Payment records linked to bookings, supports USD and LKR currencies';
COMMENT ON TABLE reviews IS 'Guest reviews of plantations with ratings and optional images';
COMMENT ON TABLE review_replies IS 'Plantation admin replies to guest reviews';
COMMENT ON TABLE plantation_requests IS 'Registration workflow for new plantations pending super admin approval';
COMMENT ON TABLE plantation_admin_accounts IS 'Temporary credentials for newly registered plantation admins';
COMMENT ON TABLE audit_logs IS 'Audit trail for all important operations';
COMMENT ON COLUMN plantations.is_disabled IS 'Super admin can disable plantations without deleting them';
COMMENT ON COLUMN bookings.status IS 'Track booking lifecycle: upcoming -> completed or cancelled';
COMMENT ON COLUMN payments.status IS 'Track payment lifecycle: pending -> paid/failed/refunded';
COMMENT ON COLUMN reviews.is_verified IS 'Only verified (legitimate) reviews should be shown to public';
