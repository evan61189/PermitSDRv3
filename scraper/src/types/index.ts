// Re-export shared types
export type {
  Permit,
  PermitWithScore,
  AIScore,
  OpportunityRating,
  ProjectType,
  Jurisdiction,
  ScraperResult,
  DashboardStats,
} from '../../../shared/index.js';

export {
  JURISDICTION_NAMES,
  PROJECT_TYPE_NAMES,
  OPPORTUNITY_RATING_CONFIG,
} from '../../../shared/index.js';

export interface ScraperConfig {
  jurisdiction: import('../../../shared/index.js').Jurisdiction;
  baseUrl: string;
  maxPages?: number;
  dateRangeDays?: number;
}

export interface ScraperFunction {
  (config?: Partial<ScraperConfig>): Promise<import('../../../shared/index.js').ScraperResult>;
}
