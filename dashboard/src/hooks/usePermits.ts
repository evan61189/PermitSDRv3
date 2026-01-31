import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { PermitWithScore, DashboardStats, Jurisdiction, ProjectType, OpportunityRating, PipelineStage } from '../types';

export interface PermitFilters {
  jurisdiction?: Jurisdiction;
  projectType?: ProjectType;
  opportunityRating?: OpportunityRating;
  pipelineStage?: PipelineStage;
  search?: string;
  minScore?: number;
  minValue?: number;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'created_at' | 'overall_score' | 'submission_date' | 'estimated_value';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export function usePermits(filters: PermitFilters = {}) {
  return useQuery({
    queryKey: ['permits', filters],
    queryFn: async (): Promise<{ data: PermitWithScore[]; count: number }> => {
      let query = supabase
        .from('permits_with_scores')
        .select('*', { count: 'exact' });

      if (filters.jurisdiction) {
        query = query.eq('source_jurisdiction', filters.jurisdiction);
      }

      if (filters.projectType) {
        query = query.eq('project_type', filters.projectType);
      }

      if (filters.opportunityRating) {
        query = query.eq('opportunity_rating', filters.opportunityRating);
      }

      if (filters.pipelineStage) {
        query = query.eq('pipeline_stage', filters.pipelineStage);
      }

      if (filters.search) {
        query = query.or(
          `description.ilike.%${filters.search}%,address.ilike.%${filters.search}%,permit_number.ilike.%${filters.search}%`
        );
      }

      if (filters.minScore !== undefined) {
        query = query.gte('overall_score', filters.minScore);
      }

      if (filters.minValue !== undefined) {
        query = query.gte('estimated_value', filters.minValue);
      }

      // Date range filtering (default to last 30 days if not specified)
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      const sortBy = filters.sortBy || 'created_at';
      const sortOrder = filters.sortOrder || 'desc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc', nullsFirst: false });

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return { data: data || [], count: count || 0 };
    },
  });
}

export function usePermit(id: string) {
  return useQuery({
    queryKey: ['permit', id],
    queryFn: async (): Promise<PermitWithScore | null> => {
      const { data, error } = await supabase
        .from('permits_with_scores')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return data;
    },
    enabled: !!id,
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async (): Promise<DashboardStats> => {
      const { data, error } = await supabase
        .from('dashboard_stats')
        .select('*')
        .single();

      if (error) throw error;

      return data;
    },
  });
}

export function usePermitsByType() {
  return useQuery({
    queryKey: ['permits-by-type'],
    queryFn: async () => {
      const res = await supabase
        .from('permits')
        .select('project_type');

      if (res.error) throw res.error;

      const counts: Record<string, number> = {};
      for (const row of res.data || []) {
        counts[row.project_type] = (counts[row.project_type] || 0) + 1;
      }

      return Object.entries(counts).map(([type, count]) => ({
        type,
        count,
      }));
    },
  });
}

export function usePermitsByJurisdiction() {
  return useQuery({
    queryKey: ['permits-by-jurisdiction'],
    queryFn: async () => {
      const res = await supabase
        .from('permits')
        .select('source_jurisdiction');

      if (res.error) throw res.error;

      const counts: Record<string, number> = {};
      for (const row of res.data || []) {
        counts[row.source_jurisdiction] = (counts[row.source_jurisdiction] || 0) + 1;
      }

      return Object.entries(counts).map(([jurisdiction, count]) => ({
        jurisdiction,
        count,
      }));
    },
  });
}

export function useHotOpportunities(limit = 10) {
  return useQuery({
    queryKey: ['hot-opportunities', limit],
    queryFn: async (): Promise<PermitWithScore[]> => {
      const { data, error } = await supabase
        .from('permits_with_scores')
        .select('*')
        .eq('opportunity_rating', 'hot')
        .order('overall_score', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    },
  });
}

export function usePermitsForMap(limit = 100) {
  return useQuery({
    queryKey: ['permits-for-map', limit],
    queryFn: async (): Promise<PermitWithScore[]> => {
      // Get all permits, ordered by score
      // Permits without coordinates will be filtered on the map component
      const { data, error } = await supabase
        .from('permits_with_scores')
        .select('*')
        .order('overall_score', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (error) throw error;

      return data || [];
    },
  });
}

export function useDeleteAllPermits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ deleted: number }> => {
      const response = await fetch('/.netlify/functions/delete-permits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete permits');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all permit-related queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['permits'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['permits-by-type'] });
      queryClient.invalidateQueries({ queryKey: ['permits-by-jurisdiction'] });
      queryClient.invalidateQueries({ queryKey: ['hot-opportunities'] });
    },
  });
}

export function useUpdatePipelineStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ permitId, stage }: { permitId: string; stage: PipelineStage }) => {
      console.log('Updating pipeline stage:', { permitId, stage });
      const { data, error } = await supabase
        .from('permits')
        .update({ pipeline_stage: stage, updated_at: new Date().toISOString() })
        .eq('id', permitId)
        .select()
        .single();

      if (error) {
        console.error('Pipeline stage update error:', error);
        throw error;
      }
      console.log('Pipeline stage updated successfully:', data);
      return data;
    },
    onSuccess: () => {
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['permits'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['permit'] });
    },
    onError: (error) => {
      console.error('Pipeline stage mutation error:', error);
    },
  });
}

export function useUpdateProjectContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ permitId, contact }: { permitId: string; contact: string }) => {
      console.log('Updating project contact:', { permitId, contact });
      const { data, error } = await supabase
        .from('permits')
        .update({ project_contact: contact, updated_at: new Date().toISOString() })
        .eq('id', permitId)
        .select()
        .single();

      if (error) {
        console.error('Project contact update error:', error);
        throw error;
      }
      console.log('Project contact updated successfully:', data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permits'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['permit'] });
    },
    onError: (error) => {
      console.error('Project contact mutation error:', error);
    },
  });
}

export function usePermitsByPipelineStage(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ['pipeline', dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('permits_with_scores')
        .select('*')
        .neq('opportunity_rating', 'not_relevant') // Exclude not_relevant permits from pipeline
        .order('overall_score', { ascending: false, nullsFirst: false });

      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Group by pipeline stage
      const byStage: Record<PipelineStage, PermitWithScore[]> = {
        lead: [],
        researching: [],
        contact_made: [],
        meeting_booked: [],
        not_interested: [],
        won: [],
        lost: [],
      };

      for (const permit of data || []) {
        const stage = (permit.pipeline_stage || 'lead') as PipelineStage;
        byStage[stage].push(permit);
      }

      return byStage;
    },
  });
}

// ==================== INSIGHTS HOOKS ====================

export interface ApplicantInsight {
  name: string;
  count: number;
  totalValue: number;
}

export interface ApplicantByCountyInsight {
  county: string;
  applicants: ApplicantInsight[];
}

export interface ContractorInsight {
  name: string;
  count: number;
  totalValue: number;
}

export interface ValueInsights {
  totalEstimatedValue: number;
  averageValue: number;
  highestValue: number;
  permitCount: number;
  valueByProjectType: { type: string; value: number; count: number }[];
}

export function useTopApplicants(limit = 5) {
  return useQuery({
    queryKey: ['top-applicants', limit],
    queryFn: async (): Promise<ApplicantInsight[]> => {
      const { data, error } = await supabase
        .from('permits')
        .select('applicant_name, estimated_value');

      if (error) throw error;

      // Aggregate by applicant name
      const applicantMap = new Map<string, { count: number; totalValue: number }>();

      for (const permit of data || []) {
        const name = permit.applicant_name?.trim();
        if (!name) continue;

        const existing = applicantMap.get(name) || { count: 0, totalValue: 0 };
        existing.count += 1;
        existing.totalValue += permit.estimated_value || 0;
        applicantMap.set(name, existing);
      }

      // Convert to array and sort by count
      const applicants: ApplicantInsight[] = Array.from(applicantMap.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      return applicants;
    },
  });
}

export function useTopApplicantsByCounty(limitPerCounty = 3) {
  return useQuery({
    queryKey: ['top-applicants-by-county', limitPerCounty],
    queryFn: async (): Promise<ApplicantByCountyInsight[]> => {
      const { data, error } = await supabase
        .from('permits')
        .select('applicant_name, county, estimated_value, source_jurisdiction');

      if (error) throw error;

      // Group by county/jurisdiction first, then aggregate applicants
      const countyMap = new Map<string, Map<string, { count: number; totalValue: number }>>();

      for (const permit of data || []) {
        const county = permit.county || permit.source_jurisdiction || 'Unknown';
        const name = permit.applicant_name?.trim();
        if (!name) continue;

        if (!countyMap.has(county)) {
          countyMap.set(county, new Map());
        }

        const applicantMap = countyMap.get(county)!;
        const existing = applicantMap.get(name) || { count: 0, totalValue: 0 };
        existing.count += 1;
        existing.totalValue += permit.estimated_value || 0;
        applicantMap.set(name, existing);
      }

      // Convert to final structure
      const result: ApplicantByCountyInsight[] = [];

      for (const [county, applicantMap] of countyMap.entries()) {
        const applicants: ApplicantInsight[] = Array.from(applicantMap.entries())
          .map(([name, stats]) => ({ name, ...stats }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limitPerCounty);

        result.push({ county, applicants });
      }

      // Sort counties by total permit count
      result.sort((a, b) => {
        const aTotal = a.applicants.reduce((sum, app) => sum + app.count, 0);
        const bTotal = b.applicants.reduce((sum, app) => sum + app.count, 0);
        return bTotal - aTotal;
      });

      return result;
    },
  });
}

export function useTopContractors(limit = 5) {
  return useQuery({
    queryKey: ['top-contractors', limit],
    queryFn: async (): Promise<ContractorInsight[]> => {
      const { data, error } = await supabase
        .from('permits')
        .select('contractor_name, estimated_value');

      if (error) throw error;

      // Aggregate by contractor name
      const contractorMap = new Map<string, { count: number; totalValue: number }>();

      for (const permit of data || []) {
        const name = permit.contractor_name?.trim();
        if (!name) continue;

        const existing = contractorMap.get(name) || { count: 0, totalValue: 0 };
        existing.count += 1;
        existing.totalValue += permit.estimated_value || 0;
        contractorMap.set(name, existing);
      }

      // Convert to array and sort by count
      const contractors: ContractorInsight[] = Array.from(contractorMap.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      return contractors;
    },
  });
}

export function useValueInsights() {
  return useQuery({
    queryKey: ['value-insights'],
    queryFn: async (): Promise<ValueInsights> => {
      const { data, error } = await supabase
        .from('permits')
        .select('estimated_value, project_type');

      if (error) throw error;

      const permits = data || [];
      const permitsWithValue = permits.filter(p => p.estimated_value && p.estimated_value > 0);

      const totalEstimatedValue = permitsWithValue.reduce((sum, p) => sum + (p.estimated_value || 0), 0);
      const averageValue = permitsWithValue.length > 0 ? totalEstimatedValue / permitsWithValue.length : 0;
      const highestValue = permitsWithValue.reduce((max, p) => Math.max(max, p.estimated_value || 0), 0);

      // Value by project type
      const typeMap = new Map<string, { value: number; count: number }>();
      for (const permit of permitsWithValue) {
        const type = permit.project_type || 'other';
        const existing = typeMap.get(type) || { value: 0, count: 0 };
        existing.value += permit.estimated_value || 0;
        existing.count += 1;
        typeMap.set(type, existing);
      }

      const valueByProjectType = Array.from(typeMap.entries())
        .map(([type, stats]) => ({ type, ...stats }))
        .sort((a, b) => b.value - a.value);

      return {
        totalEstimatedValue,
        averageValue,
        highestValue,
        permitCount: permits.length,
        valueByProjectType,
      };
    },
  });
}

// ==================== TRENDING & ANALYTICS HOOKS ====================

export interface WeeklyTrend {
  week: string;
  weekLabel: string;
  count: number;
  totalValue: number;
}

export interface CompanyToWatch {
  name: string;
  recentCount: number;
  previousCount: number;
  changePercent: number;
  totalValue: number;
  isNew: boolean;
}

export interface ProjectTypeTrend {
  type: string;
  typeName: string;
  recentCount: number;
  previousCount: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
}

export interface AIRecommendation {
  type: 'outreach' | 'watch' | 'opportunity' | 'trend';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  actionLabel?: string;
  actionLink?: string;
}

export function usePermitTrends(weeks = 8) {
  return useQuery({
    queryKey: ['permit-trends', weeks],
    queryFn: async (): Promise<WeeklyTrend[]> => {
      const { data, error } = await supabase
        .from('permits')
        .select('created_at, estimated_value');

      if (error) throw error;

      // Group by week
      const weekMap = new Map<string, { count: number; totalValue: number }>();
      const now = new Date();

      // Initialize weeks
      for (let i = 0; i < weeks; i++) {
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - (i * 7) - now.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        weekMap.set(weekKey, { count: 0, totalValue: 0 });
      }

      for (const permit of data || []) {
        const permitDate = new Date(permit.created_at);
        const weekStart = new Date(permitDate);
        weekStart.setDate(weekStart.getDate() - permitDate.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];

        const existing = weekMap.get(weekKey);
        if (existing) {
          existing.count += 1;
          existing.totalValue += permit.estimated_value || 0;
        }
      }

      // Convert to array and format
      const trends: WeeklyTrend[] = Array.from(weekMap.entries())
        .map(([week, stats]) => {
          const date = new Date(week);
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          return {
            week,
            weekLabel: `${monthNames[date.getMonth()]} ${date.getDate()}`,
            ...stats,
          };
        })
        .sort((a, b) => a.week.localeCompare(b.week));

      return trends;
    },
  });
}

export function useCompaniesToWatch(limit = 5) {
  return useQuery({
    queryKey: ['companies-to-watch', limit],
    queryFn: async (): Promise<CompanyToWatch[]> => {
      const { data, error } = await supabase
        .from('permits')
        .select('applicant_name, created_at, estimated_value');

      if (error) throw error;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // Track activity in recent 30 days vs previous 30 days
      const companyStats = new Map<string, {
        recentCount: number;
        previousCount: number;
        totalValue: number;
      }>();

      for (const permit of data || []) {
        const name = permit.applicant_name?.trim();
        if (!name) continue;

        const permitDate = new Date(permit.created_at);
        const existing = companyStats.get(name) || { recentCount: 0, previousCount: 0, totalValue: 0 };

        if (permitDate >= thirtyDaysAgo) {
          existing.recentCount += 1;
          existing.totalValue += permit.estimated_value || 0;
        } else if (permitDate >= sixtyDaysAgo) {
          existing.previousCount += 1;
        }

        companyStats.set(name, existing);
      }

      // Find companies with significant activity changes
      const companies: CompanyToWatch[] = Array.from(companyStats.entries())
        .filter(([_, stats]) => stats.recentCount >= 2) // At least 2 recent permits
        .map(([name, stats]) => {
          const changePercent = stats.previousCount === 0
            ? 100 // New entrant
            : Math.round(((stats.recentCount - stats.previousCount) / stats.previousCount) * 100);

          return {
            name,
            recentCount: stats.recentCount,
            previousCount: stats.previousCount,
            changePercent,
            totalValue: stats.totalValue,
            isNew: stats.previousCount === 0,
          };
        })
        .sort((a, b) => {
          // Prioritize new companies, then by change percent
          if (a.isNew && !b.isNew) return -1;
          if (!a.isNew && b.isNew) return 1;
          return b.changePercent - a.changePercent;
        })
        .slice(0, limit);

      return companies;
    },
  });
}

export function useProjectTypeTrends() {
  return useQuery({
    queryKey: ['project-type-trends'],
    queryFn: async (): Promise<ProjectTypeTrend[]> => {
      const { data, error } = await supabase
        .from('permits')
        .select('project_type, created_at');

      if (error) throw error;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      const typeStats = new Map<string, { recentCount: number; previousCount: number }>();

      for (const permit of data || []) {
        const type = permit.project_type || 'other';
        const permitDate = new Date(permit.created_at);
        const existing = typeStats.get(type) || { recentCount: 0, previousCount: 0 };

        if (permitDate >= thirtyDaysAgo) {
          existing.recentCount += 1;
        } else if (permitDate >= sixtyDaysAgo) {
          existing.previousCount += 1;
        }

        typeStats.set(type, existing);
      }

      const PROJECT_TYPE_NAMES: Record<string, string> = {
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

      const trends: ProjectTypeTrend[] = Array.from(typeStats.entries())
        .filter(([_, stats]) => stats.recentCount > 0 || stats.previousCount > 0)
        .map(([type, stats]) => {
          const changePercent = stats.previousCount === 0
            ? (stats.recentCount > 0 ? 100 : 0)
            : Math.round(((stats.recentCount - stats.previousCount) / stats.previousCount) * 100);

          let trend: 'up' | 'down' | 'stable' = 'stable';
          if (changePercent > 10) trend = 'up';
          else if (changePercent < -10) trend = 'down';

          return {
            type,
            typeName: PROJECT_TYPE_NAMES[type] || type,
            recentCount: stats.recentCount,
            previousCount: stats.previousCount,
            changePercent,
            trend,
          };
        })
        .sort((a, b) => b.changePercent - a.changePercent);

      return trends;
    },
  });
}

export function useAIRecommendations() {
  const { data: topApplicants } = useTopApplicants(3);
  const { data: companiesToWatch } = useCompaniesToWatch(3);
  const { data: typeTrends } = useProjectTypeTrends();
  const { data: valueInsights } = useValueInsights();

  return useQuery({
    queryKey: ['ai-recommendations', topApplicants, companiesToWatch, typeTrends, valueInsights],
    queryFn: async (): Promise<AIRecommendation[]> => {
      const recommendations: AIRecommendation[] = [];

      // Recommendation: Reach out to top applicants
      if (topApplicants && topApplicants.length > 0) {
        const top = topApplicants[0];
        recommendations.push({
          type: 'outreach',
          priority: 'high',
          title: `Reach out to ${top.name}`,
          description: `Most active applicant with ${top.count} permits. Building a relationship could lead to repeat business.`,
          actionLabel: 'View permits',
          actionLink: `/permits?search=${encodeURIComponent(top.name)}`,
        });
      }

      // Recommendation: Watch emerging companies
      if (companiesToWatch && companiesToWatch.length > 0) {
        const emerging = companiesToWatch.find(c => c.isNew);
        if (emerging) {
          recommendations.push({
            type: 'watch',
            priority: 'medium',
            title: `New player: ${emerging.name}`,
            description: `New to the market with ${emerging.recentCount} permits in 30 days. Could be expanding operations.`,
            actionLabel: 'View permits',
            actionLink: `/permits?search=${encodeURIComponent(emerging.name)}`,
          });
        }
      }

      // Recommendation: Growing project types
      if (typeTrends && typeTrends.length > 0) {
        const growing = typeTrends.find(t => t.trend === 'up' && t.recentCount >= 3);
        if (growing) {
          recommendations.push({
            type: 'trend',
            priority: 'medium',
            title: `${growing.typeName} is trending up`,
            description: `${growing.changePercent}% increase in ${growing.typeName.toLowerCase()} permits. Consider targeting this segment.`,
            actionLabel: 'View permits',
            actionLink: `/permits?projectType=${growing.type}`,
          });
        }
      }

      // Recommendation: High-value opportunities
      if (valueInsights && valueInsights.highestValue > 500000) {
        recommendations.push({
          type: 'opportunity',
          priority: 'high',
          title: 'High-value project available',
          description: `There's a project worth ${formatCurrencyLong(valueInsights.highestValue)}. Check hot opportunities for details.`,
          actionLabel: 'View hot opportunities',
          actionLink: '/permits?rating=hot',
        });
      }

      // Recommendation: Pipeline focus
      recommendations.push({
        type: 'opportunity',
        priority: 'low',
        title: 'Review your pipeline',
        description: 'Check your pipeline for leads that need follow-up. Consistent outreach improves conversion.',
        actionLabel: 'Go to pipeline',
        actionLink: '/pipeline',
      });

      return recommendations.slice(0, 4); // Return top 4 recommendations
    },
    enabled: !!(topApplicants || companiesToWatch || typeTrends || valueInsights),
  });
}

// Helper for formatting currency in recommendations
function formatCurrencyLong(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

// ==================== EXPORT FUNCTIONS ====================

export interface ExportData {
  permits: Array<{
    permit_number: string;
    description: string;
    address: string;
    city: string;
    county: string;
    applicant_name: string;
    contractor_name: string;
    estimated_value: number;
    project_type: string;
    status: string;
    submission_date: string;
    opportunity_rating: string;
    overall_score: number;
  }>;
  insights: {
    totalPermits: number;
    totalValue: number;
    topApplicants: ApplicantInsight[];
    topContractors: ContractorInsight[];
  };
  generatedAt: string;
}

export function useExportInsights() {
  return useQuery({
    queryKey: ['export-data'],
    queryFn: async (): Promise<ExportData> => {
      const { data: permits, error } = await supabase
        .from('permits_with_scores')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const permitsData = (permits || []).map(p => ({
        permit_number: p.permit_number || '',
        description: p.description || '',
        address: p.address || '',
        city: p.city || '',
        county: p.county || '',
        applicant_name: p.applicant_name || '',
        contractor_name: p.contractor_name || '',
        estimated_value: p.estimated_value || 0,
        project_type: p.project_type || '',
        status: p.status || '',
        submission_date: p.submission_date || '',
        opportunity_rating: p.opportunity_rating || '',
        overall_score: p.overall_score || 0,
      }));

      // Calculate insights
      const applicantMap = new Map<string, { count: number; totalValue: number }>();
      const contractorMap = new Map<string, { count: number; totalValue: number }>();
      let totalValue = 0;

      for (const p of permitsData) {
        totalValue += p.estimated_value;

        if (p.applicant_name) {
          const existing = applicantMap.get(p.applicant_name) || { count: 0, totalValue: 0 };
          existing.count += 1;
          existing.totalValue += p.estimated_value;
          applicantMap.set(p.applicant_name, existing);
        }

        if (p.contractor_name) {
          const existing = contractorMap.get(p.contractor_name) || { count: 0, totalValue: 0 };
          existing.count += 1;
          existing.totalValue += p.estimated_value;
          contractorMap.set(p.contractor_name, existing);
        }
      }

      const topApplicants = Array.from(applicantMap.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const topContractors = Array.from(contractorMap.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        permits: permitsData,
        insights: {
          totalPermits: permitsData.length,
          totalValue,
          topApplicants,
          topContractors,
        },
        generatedAt: new Date().toISOString(),
      };
    },
    enabled: false, // Only fetch when explicitly requested
  });
}
