-- Student registration cleanup: drop unused columns, migrate photo BLOB to base64 text.
-- Run against PostgreSQL after backup.

ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_base64 TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'photo_data'
  ) THEN
    UPDATE students
    SET photo_base64 = encode(photo_data::bytea, 'base64')
    WHERE photo_data IS NOT NULL AND (photo_base64 IS NULL OR photo_base64 = '');
  END IF;
END $$;

ALTER TABLE students DROP COLUMN IF EXISTS photo_data;

ALTER TABLE students DROP COLUMN IF EXISTS bank_name;
ALTER TABLE students DROP COLUMN IF EXISTS bank_branch;
ALTER TABLE students DROP COLUMN IF EXISTS bank_ifsc;
ALTER TABLE students DROP COLUMN IF EXISTS height_cm;
ALTER TABLE students DROP COLUMN IF EXISTS weight_kg;
ALTER TABLE students DROP COLUMN IF EXISTS hostel_name;
ALTER TABLE students DROP COLUMN IF EXISTS room_no;

ALTER TABLE student_previous_schools DROP COLUMN IF EXISTS current_school_name;
