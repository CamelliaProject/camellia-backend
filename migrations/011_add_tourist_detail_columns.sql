-- Add NIC/Passport and city columns to bookings table
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS tourist_nic_passport VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tourist_city VARCHAR(100);
