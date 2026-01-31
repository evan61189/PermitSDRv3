export type Jurisdiction =
  | 'howard_county_md'
  | 'baltimore_city_md'
  | 'anne_arundel_county_md';

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

export type TaskPriority = 'low' | 'medium' | 'high';

export type PipelineStage =
  | 'lead'
  | 'researching'
  | 'contact_made'
  | 'meeting_booked'
  | 'not_interested'
  | 'won'
  | 'lost';

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
  screenshot_url?: string;
  detail_url?: string;
  latitude?: number;
  longitude?: number;
  pipeline_stage?: PipelineStage;
  project_contact?: string;
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

export interface Task {
  id: string;
  permit_id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority: TaskPriority;
  completed: boolean;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskWithPermit extends Task {
  permit_number: string;
  address: string;
  city: string;
  project_type: ProjectType;
  pipeline_stage?: PipelineStage;
  applicant_name?: string;
}

export const JURISDICTION_NAMES: Record<Jurisdiction, string> = {
  howard_county_md: 'Howard County, MD',
  baltimore_city_md: 'Baltimore City, MD',
  anne_arundel_county_md: 'Anne Arundel County, MD',
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

export const PIPELINE_STAGE_CONFIG: Record<
  PipelineStage,
  { label: string; color: string; bgColor: string; textColor: string; order: number }
> = {
  lead: { label: 'Lead', color: '#6366f1', bgColor: 'bg-indigo-50', textColor: 'text-indigo-700', order: 1 },
  researching: { label: 'Researching', color: '#8b5cf6', bgColor: 'bg-purple-50', textColor: 'text-purple-700', order: 2 },
  contact_made: { label: 'Contact Made', color: '#f59e0b', bgColor: 'bg-amber-50', textColor: 'text-amber-700', order: 3 },
  meeting_booked: { label: 'Meeting Booked', color: '#10b981', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', order: 4 },
  not_interested: { label: 'Not Interested', color: '#6b7280', bgColor: 'bg-gray-50', textColor: 'text-gray-700', order: 5 },
  won: { label: 'Won', color: '#22c55e', bgColor: 'bg-green-50', textColor: 'text-green-700', order: 6 },
  lost: { label: 'Lost', color: '#ef4444', bgColor: 'bg-red-50', textColor: 'text-red-700', order: 7 },
};

export const TASK_PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; bgColor: string; textColor: string; borderColor: string }
> = {
  low: { label: 'Low', bgColor: 'bg-gray-50', textColor: 'text-gray-600', borderColor: 'border-gray-200' },
  medium: { label: 'Medium', bgColor: 'bg-blue-50', textColor: 'text-blue-700', borderColor: 'border-blue-200' },
  high: { label: 'High', bgColor: 'bg-red-50', textColor: 'text-red-700', borderColor: 'border-red-200' },
};
