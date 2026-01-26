import { createClient } from '@supabase/supabase-js';
import type { Permit, AIScore } from '../types/index.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function upsertPermit(permit: Omit<Permit, 'id' | 'created_at' | 'updated_at'>): Promise<Permit> {
  const { data, error } = await supabase
    .from('permits')
    .upsert(
      {
        ...permit,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'permit_number,source_jurisdiction',
      }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert permit: ${error.message}`);
  }

  return data;
}

export async function upsertPermits(permits: Omit<Permit, 'id' | 'created_at' | 'updated_at'>[]): Promise<Permit[]> {
  if (permits.length === 0) return [];

  const { data, error } = await supabase
    .from('permits')
    .upsert(
      permits.map((p) => ({
        ...p,
        updated_at: new Date().toISOString(),
      })),
      {
        onConflict: 'permit_number,source_jurisdiction',
      }
    )
    .select();

  if (error) {
    throw new Error(`Failed to upsert permits: ${error.message}`);
  }

  return data || [];
}

export async function saveAIScore(score: Omit<AIScore, 'id'>): Promise<AIScore> {
  const { data, error } = await supabase
    .from('ai_scores')
    .upsert(score, {
      onConflict: 'permit_id',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save AI score: ${error.message}`);
  }

  return data;
}

export async function getUnscorredPermits(limit = 50): Promise<Permit[]> {
  const { data, error } = await supabase
    .from('permits')
    .select('*, ai_scores(*)')
    .is('ai_scores', null)
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch unscored permits: ${error.message}`);
  }

  return data || [];
}
