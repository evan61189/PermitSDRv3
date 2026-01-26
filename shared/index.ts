// Shared types for Permit SDR Platform - Clipper Construction

export interface Permit {
  id: string;
  permit_number: string;
  description: string;
  address: string;
  city: string;
  county: string;
  state: string;
  zip_code?: string;
  project_type: ProjectType;
  permit_type: string;
  status: string;
  applicant_name?: string;
  contractor_name?: string;
  estimated_value?: number;
  square_footage?: number;
  submission_date?: string;
  issue_date?: string;
  expiration_date?: string;
  source_url: string;
  source_jurisdiction: Jurisdiction;
  raw_data?: Record<string, unknown>;
  screenshot_url?: string;
  detail_url?: string;
  created_at: string;
  updated_at: string;
}

export interface PermitWithScore extends Permit {
  ai_score: AIScore | null;
}

export interface AIScore {
  id: string;
  permit_id: string;
  overall_score: number; // 0-100
  opportunity_rating: OpportunityRating;
  project_size_score: number;
  timing_score: number;
  location_score: number;
  competition_score: number; // Also used as "fit_score" for Clipper relevance
  reasoning: string;
  keywords_detected: string[];
  recommended_actions: string[];
  scored_at: string;
}

export type OpportunityRating = 'hot' | 'warm' | 'cold' | 'not_relevant';

export type ProjectType =
  | 'commercial_new'
  | 'commercial_renovation'
  | 'residential_new'
  | 'residential_renovation'
  | 'industrial'
  | 'mixed_use'
  | 'demolition'
  | 'electrical'
  | 'plumbing'
  | 'hvac'
  | 'roofing'
  | 'other';

export type Jurisdiction =
  | 'howard_county_md'
  | 'baltimore_city_md'
  | 'anne_arundel_county_md';

export const JURISDICTION_NAMES: Record<Jurisdiction, string> = {
  howard_county_md: 'Howard County, MD',
  baltimore_city_md: 'Baltimore City, MD',
  anne_arundel_county_md: 'Anne Arundel County, MD',
};

export const PROJECT_TYPE_NAMES: Record<ProjectType, string> = {
  commercial_new: 'Commercial - New Construction',
  commercial_renovation: 'Commercial - Renovation',
  residential_new: 'Residential - New Construction',
  residential_renovation: 'Residential - Renovation',
  industrial: 'Industrial',
  mixed_use: 'Mixed Use',
  demolition: 'Demolition',
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  hvac: 'HVAC',
  roofing: 'Roofing',
  other: 'Other',
};

export const OPPORTUNITY_RATING_CONFIG: Record<
  OpportunityRating,
  { label: string; color: string; bgColor: string }
> = {
  hot: { label: 'Hot', color: '#dc2626', bgColor: '#fef2f2' },
  warm: { label: 'Warm', color: '#f59e0b', bgColor: '#fffbeb' },
  cold: { label: 'Cold', color: '#3b82f6', bgColor: '#eff6ff' },
  not_relevant: { label: 'Not Relevant', color: '#6b7280', bgColor: '#f9fafb' },
};

export interface ScraperResult {
  jurisdiction: Jurisdiction;
  permits: Omit<Permit, 'id' | 'created_at' | 'updated_at'>[];
  scraped_at: string;
  success: boolean;
  error?: string;
}

export interface DashboardStats {
  total_permits: number;
  hot_opportunities: number;
  warm_opportunities: number;
  permits_by_type: Record<ProjectType, number>;
  permits_by_jurisdiction: Record<Jurisdiction, number>;
  recent_permits: PermitWithScore[];
}
