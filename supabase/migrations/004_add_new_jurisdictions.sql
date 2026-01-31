-- Add Carroll County jurisdiction
-- Run this migration to support the Carroll County scraper

-- Add Carroll County to the jurisdiction enum
ALTER TYPE jurisdiction ADD VALUE IF NOT EXISTS 'carroll_county_md';

-- Note: In PostgreSQL, you cannot remove enum values, only add them.
-- The above statement is idempotent - it won't fail if the value already exists.

COMMENT ON TYPE jurisdiction IS 'Supported jurisdictions: Howard County MD, Baltimore City MD, Anne Arundel County MD, Carroll County MD';
