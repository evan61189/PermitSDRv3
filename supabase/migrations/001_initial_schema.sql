-- Permit SDR v3 Database Schema
-- Run this migration to set up the initial database structure

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE jurisdiction AS ENUM (
  'howard_county_md',
  'baltimore_county_md',
  'anne_arundel_county_md',
  'dc'
);

CREATE TYPE project_type AS ENUM (
  'commercial_new',
  'commercial_renovation',
  'residential_new',
  'residential_renovation',
  'industrial',
  'mixed_use',
  'demolition',
  'electrical',
  'plumbing',
  'hvac',
  'roofing',
  'other'
);

CREATE TYPE opportunity_rating AS ENUM (
  'hot',
  'warm',
  'cold',
  'not_relevant'
);

-- Create permits table
CREATE TABLE permits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  permit_number VARCHAR(100) NOT NULL,
  description TEXT,
  address VARCHAR(500) NOT NULL,
  city VARCHAR(100) NOT NULL,
  county VARCHAR(100) NOT NULL,
  state VARCHAR(2) NOT NULL,
  zip_code VARCHAR(10),
  project_type project_type NOT NULL DEFAULT 'other',
  permit_type VARCHAR(200),
  status VARCHAR(100) NOT NULL DEFAULT 'Unknown',
  applicant_name VARCHAR(300),
  contractor_name VARCHAR(300),
  estimated_value DECIMAL(15, 2),
  square_footage INTEGER,
  submission_date TIMESTAMPTZ,
  issue_date TIMESTAMPTZ,
  expiration_date TIMESTAMPTZ,
  source_url TEXT NOT NULL,
  source_jurisdiction jurisdiction NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint on permit number + jurisdiction
  CONSTRAINT unique_permit_per_jurisdiction UNIQUE (permit_number, source_jurisdiction)
);

-- Create AI scores table
CREATE TABLE ai_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  permit_id UUID NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
  overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  opportunity_rating opportunity_rating NOT NULL,
  project_size_score INTEGER CHECK (project_size_score >= 0 AND project_size_score <= 100),
  timing_score INTEGER CHECK (timing_score >= 0 AND timing_score <= 100),
  location_score INTEGER CHECK (location_score >= 0 AND location_score <= 100),
  competition_score INTEGER CHECK (competition_score >= 0 AND competition_score <= 100),
  reasoning TEXT,
  keywords_detected TEXT[],
  recommended_actions TEXT[],
  scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One score per permit
  CONSTRAINT unique_score_per_permit UNIQUE (permit_id)
);

-- Create scrape_logs table for tracking scraper runs
CREATE TABLE scrape_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jurisdiction jurisdiction NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  permits_found INTEGER DEFAULT 0,
  permits_saved INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB
);

-- Create indexes for common queries
CREATE INDEX idx_permits_jurisdiction ON permits(source_jurisdiction);
CREATE INDEX idx_permits_project_type ON permits(project_type);
CREATE INDEX idx_permits_status ON permits(status);
CREATE INDEX idx_permits_created_at ON permits(created_at DESC);
CREATE INDEX idx_permits_submission_date ON permits(submission_date DESC);
CREATE INDEX idx_permits_city ON permits(city);
CREATE INDEX idx_permits_county ON permits(county);

CREATE INDEX idx_ai_scores_rating ON ai_scores(opportunity_rating);
CREATE INDEX idx_ai_scores_overall ON ai_scores(overall_score DESC);
CREATE INDEX idx_ai_scores_permit ON ai_scores(permit_id);

CREATE INDEX idx_scrape_logs_jurisdiction ON scrape_logs(jurisdiction);
CREATE INDEX idx_scrape_logs_started_at ON scrape_logs(started_at DESC);

-- Full text search index on description
CREATE INDEX idx_permits_description_fts ON permits
  USING gin(to_tsvector('english', COALESCE(description, '')));

-- Create view for permits with scores
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

-- Create view for dashboard stats
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
  COUNT(*) as total_permits,
  COUNT(CASE WHEN s.opportunity_rating = 'hot' THEN 1 END) as hot_opportunities,
  COUNT(CASE WHEN s.opportunity_rating = 'warm' THEN 1 END) as warm_opportunities,
  COUNT(CASE WHEN s.opportunity_rating = 'cold' THEN 1 END) as cold_opportunities,
  COUNT(CASE WHEN s.opportunity_rating = 'not_relevant' THEN 1 END) as not_relevant,
  COUNT(CASE WHEN s.id IS NULL THEN 1 END) as unscored
FROM permits p
LEFT JOIN ai_scores s ON p.id = s.permit_id;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_permits_updated_at
  BEFORE UPDATE ON permits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
-- Enable RLS on tables
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users
CREATE POLICY "Allow read access for authenticated users" ON permits
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read access for authenticated users" ON ai_scores
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read access for authenticated users" ON scrape_logs
  FOR SELECT TO authenticated USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access" ON permits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON ai_scores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Allow service role full access" ON scrape_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON permits_with_scores TO authenticated;
GRANT SELECT ON dashboard_stats TO authenticated;

COMMENT ON TABLE permits IS 'Stores construction permit data scraped from various jurisdictions';
COMMENT ON TABLE ai_scores IS 'AI-generated scores and analysis for each permit';
COMMENT ON TABLE scrape_logs IS 'Logs of scraper runs for monitoring and debugging';
