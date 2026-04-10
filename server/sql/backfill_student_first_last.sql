-- One-time backfill for PostgreSQL: populate first_name / last_name from legacy full_name,
-- and normalize full_name when only parts were stored. Run manually after deploy if you have
-- existing rows from before the split-name registration form.

-- 1) First name: first word of full_name when first_name is empty
UPDATE students
SET first_name = split_part(trim(full_name), ' ', 1)
WHERE (first_name IS NULL OR btrim(first_name) = '')
  AND full_name IS NOT NULL
  AND btrim(full_name) <> '';

-- 2) Last name: remainder of full_name after the first word
UPDATE students
SET last_name = trim(substring(trim(full_name) from length(split_part(trim(full_name), ' ', 1)) + 2))
WHERE (last_name IS NULL OR btrim(last_name) = '')
  AND full_name IS NOT NULL
  AND btrim(full_name) <> ''
  AND position(' ' in trim(full_name)) > 0;

-- 3) Denormalized full_name when it was blank but parts exist
UPDATE students
SET full_name = trim(
  concat_ws(
    ' ',
    NULLIF(trim(first_name), ''),
    NULLIF(trim(last_name), '')
  )
)
WHERE (full_name IS NULL OR btrim(full_name) = '')
  AND (
    (first_name IS NOT NULL AND btrim(first_name) <> '')
    OR (last_name IS NOT NULL AND btrim(last_name) <> '')
  );
