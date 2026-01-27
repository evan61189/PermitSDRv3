import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { PermitWithScore, DashboardStats, Jurisdiction, ProjectType, OpportunityRating } from '../types';

export interface PermitFilters {
  jurisdiction?: Jurisdiction;
  projectType?: ProjectType;
  opportunityRating?: OpportunityRating;
  search?: string;
  minScore?: number;
  sortBy?: 'created_at' | 'overall_score' | 'submission_date';
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

      if (filters.search) {
        query = query.or(
          `description.ilike.%${filters.search}%,address.ilike.%${filters.search}%,permit_number.ilike.%${filters.search}%`
        );
      }

      if (filters.minScore !== undefined) {
        query = query.gte('overall_score', filters.minScore);
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
