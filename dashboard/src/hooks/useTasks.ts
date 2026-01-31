import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Task, TaskWithPermit, TaskPriority } from '../types';

// ==================== TASK QUERIES ====================

/**
 * Get all tasks for a specific permit
 */
export function usePermitTasks(permitId: string) {
  return useQuery({
    queryKey: ['tasks', 'permit', permitId],
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('permit_id', permitId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!permitId,
  });
}

/**
 * Get all tasks across all permits with permit details
 */
export function useAllTasks(options?: {
  completed?: boolean;
  overdueOnly?: boolean;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['tasks', 'all', options],
    queryFn: async (): Promise<TaskWithPermit[]> => {
      let query = supabase
        .from('tasks_with_permits')
        .select('*')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: false });

      if (options?.completed !== undefined) {
        query = query.eq('completed', options.completed);
      }

      if (options?.overdueOnly) {
        const now = new Date().toISOString();
        query = query
          .eq('completed', false)
          .lt('due_date', now);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Get upcoming tasks (due in the next 7 days)
 */
export function useUpcomingTasks(days = 7) {
  return useQuery({
    queryKey: ['tasks', 'upcoming', days],
    queryFn: async (): Promise<TaskWithPermit[]> => {
      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + days);

      const { data, error } = await supabase
        .from('tasks_with_permits')
        .select('*')
        .eq('completed', false)
        .gte('due_date', now.toISOString())
        .lte('due_date', future.toISOString())
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Get overdue tasks
 */
export function useOverdueTasks() {
  return useQuery({
    queryKey: ['tasks', 'overdue'],
    queryFn: async (): Promise<TaskWithPermit[]> => {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('tasks_with_permits')
        .select('*')
        .eq('completed', false)
        .lt('due_date', now)
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Get task counts for dashboard
 */
export function useTaskCounts() {
  return useQuery({
    queryKey: ['tasks', 'counts'],
    queryFn: async () => {
      // Get all incomplete tasks
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('id, due_date, completed')
        .eq('completed', false);

      if (error) throw error;

      const counts = {
        total: tasks?.length || 0,
        overdue: 0,
        dueToday: 0,
        upcoming: 0,
      };

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      for (const task of tasks || []) {
        if (!task.due_date) continue;
        const dueDate = new Date(task.due_date);

        if (dueDate < today) {
          counts.overdue++;
        } else if (dueDate >= today && dueDate < tomorrow) {
          counts.dueToday++;
        } else if (dueDate >= tomorrow && dueDate < nextWeek) {
          counts.upcoming++;
        }
      }

      return counts;
    },
  });
}

// ==================== TASK MUTATIONS ====================

interface CreateTaskInput {
  permit_id: string;
  title: string;
  description?: string;
  due_date?: string;
  priority?: TaskPriority;
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTaskInput): Promise<Task> => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          permit_id: input.permit_id,
          title: input.title,
          description: input.description,
          due_date: input.due_date,
          priority: input.priority || 'medium',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks', 'permit', data.permit_id] });
    },
  });
}

interface UpdateTaskInput {
  id: string;
  title?: string;
  description?: string;
  due_date?: string | null;
  priority?: TaskPriority;
  completed?: boolean;
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateTaskInput): Promise<Task> => {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.due_date !== undefined) updates.due_date = input.due_date;
      if (input.priority !== undefined) updates.priority = input.priority;
      if (input.completed !== undefined) {
        updates.completed = input.completed;
        updates.completed_at = input.completed ? new Date().toISOString() : null;
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useToggleTaskComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }): Promise<Task> => {
      const { data, error } = await supabase
        .from('tasks')
        .update({
          completed,
          completed_at: completed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
