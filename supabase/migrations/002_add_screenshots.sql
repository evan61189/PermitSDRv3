-- Add screenshot_url and detail_url columns to permits table
ALTER TABLE permits ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
ALTER TABLE permits ADD COLUMN IF NOT EXISTS detail_url TEXT;

-- Create index for detail_url
CREATE INDEX IF NOT EXISTS idx_permits_detail_url ON permits(detail_url);

-- Update the permits_with_scores view to include new columns
DROP VIEW IF EXISTS permits_with_scores;
CREATE OR REPLACE VIEW permits_with_scores AS
SELECT
  p.*,
  s.overall_score,
  s.opportunity_rating,
  s.project_size_score,
  s.timing_score,
  s.location_score,
  s.competition_score,
  s.reasoning,
  s.keywords_detected,
  s.recommended_actions,
  s.scored_at
FROM permits p
LEFT JOIN ai_scores s ON p.id = s.permit_id;

-- Grant permissions on updated view
GRANT SELECT ON permits_with_scores TO authenticated;

COMMENT ON COLUMN permits.screenshot_url IS 'URL to screenshot of permit details page';
COMMENT ON COLUMN permits.detail_url IS 'Direct URL to permit detail page on source website';
