-- Add new jurisdictions for Baltimore County and Carroll County
-- Run this migration to support the new county scrapers

-- Add new values to the jurisdiction enum
ALTER TYPE jurisdiction ADD VALUE IF NOT EXISTS 'baltimore_county_md';
ALTER TYPE jurisdiction ADD VALUE IF NOT EXISTS 'carroll_county_md';

-- Note: In PostgreSQL, you cannot remove enum values, only add them.
-- The above statements are idempotent - they won't fail if the values already exist.

COMMENT ON TYPE jurisdiction IS 'Supported jurisdictions: Howard County MD, Baltimore City MD, Anne Arundel County MD, Baltimore County MD, Carroll County MD';
