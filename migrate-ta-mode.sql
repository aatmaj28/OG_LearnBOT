-- Migration: Add ta_mode column to classes table for per-class TA mode
-- This allows faculty to set different TA modes (lenient/normal/strict) per class
-- null = use faculty's default TA mode from users.ta_mode

-- Connect to your PostgreSQL server and run this SQL:
-- psql -h <DB_HOST> -p <DB_PORT> -U <DB_USER> -d <DB_NAME> -f migrate-ta-mode.sql

ALTER TABLE classes ADD COLUMN IF NOT EXISTS ta_mode VARCHAR(20) DEFAULT NULL;

-- Verify the column was added:
-- SELECT column_name, data_type, is_nullable, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'classes' AND column_name = 'ta_mode';
