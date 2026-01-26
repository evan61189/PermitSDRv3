export type Jurisdiction =
  | 'howard_county_md'
  | 'baltimore_county_md'
  | 'anne_arundel_county_md'
  | 'dc';

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

export type OpportunityRating = 'hot' | 'warm' | 'cold' | 'not_relevant';

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
  created_at: string;
  updated_at: string;
}

export interface PermitWithScore extends Permit {
  overall_score: number | null;
  opportunity_rating: OpportunityRating | null;
  project_size_score: number | null;
  timing_score: number | null;
  location_score: number | null;
  competition_score: number | null;
  reasoning: string | null;
  keywords_detected: string[] | null;
  recommended_actions: string[] | null;
  scored_at: string | null;
}

export interface DashboardStats {
  total_permits: number;
  hot_opportunities: number;
  warm_opportunities: number;
  cold_opportunities: number;
  not_relevant: number;
  unscored: number;
}

export const JURISDICTION_NAMES: Record<Jurisdiction, string> = {
  howard_county_md: 'Howard County, MD',
  baltimore_county_md: 'Baltimore County, MD',
  anne_arundel_county_md: 'Anne Arundel County, MD',
  dc: 'Washington, DC',
};

export const PROJECT_TYPE_NAMES: Record<ProjectType, string> = {
  commercial_new: 'Commercial - New',
  commercial_renovation: 'Commercial - Renovation',
  residential_new: 'Residential - New',
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

export const OPPORTUNITY_COLORS: Record<OpportunityRating, { bg: string; text: string; border: string }> = {
  hot: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  warm: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  cold: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  not_relevant: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' },
};
