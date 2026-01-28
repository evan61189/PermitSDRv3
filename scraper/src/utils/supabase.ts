import { createClient } from '@supabase/supabase-js';
import type { Permit, AIScore } from '../types/index.js';
import { geocodeAddress } from './geocoder.js';

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

  // Deduplicate permits by permit_number + source_jurisdiction to avoid
  // "ON CONFLICT DO UPDATE command cannot affect row a second time" error
  const uniquePermits = new Map<string, Omit<Permit, 'id' | 'created_at' | 'updated_at'>>();
  for (const permit of permits) {
    const key = `${permit.permit_number}::${permit.source_jurisdiction}`;
    // Keep the last occurrence (which may have more complete data)
    uniquePermits.set(key, permit);
  }

  const deduplicatedPermits = Array.from(uniquePermits.values());
  console.log(`[supabase] Upserting ${deduplicatedPermits.length} permits (${permits.length - deduplicatedPermits.length} duplicates removed)`);

  // Geocode permits that don't have lat/long (sequentially to respect rate limits)
  console.log(`[supabase] Geocoding addresses...`);
  const geocodedPermits: typeof deduplicatedPermits = [];

  for (const permit of deduplicatedPermits) {
    // Skip if already geocoded
    if (permit.latitude && permit.longitude) {
      geocodedPermits.push(permit);
      continue;
    }

    // Skip if no valid address
    if (!permit.address || permit.address.length < 5) {
      geocodedPermits.push(permit);
      continue;
    }

    try {
      const coords = await geocodeAddress(
        permit.address,
        permit.city,
        permit.state,
        permit.zip_code
      );

      if (coords) {
        geocodedPermits.push({
          ...permit,
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
      } else {
        geocodedPermits.push(permit);
      }
    } catch (error) {
      console.warn(`[supabase] Failed to geocode ${permit.address}:`, error);
      geocodedPermits.push(permit);
    }
  }

  const geocodedCount = geocodedPermits.filter(p => p.latitude && p.longitude).length;
  console.log(`[supabase] Geocoded ${geocodedCount}/${geocodedPermits.length} permits`);

  const { data, error } = await supabase
    .from('permits')
    .upsert(
      geocodedPermits.map((p) => ({
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

/**
 * Save AI scores that were extracted along with permit data.
 * This is used when scores are generated during the extraction process
 * (via extractAndScorePermit) rather than in a separate scoring step.
 */
export async function saveExtractedScores(permits: Permit[]): Promise<number> {
  let savedCount = 0;

  for (const permit of permits) {
    // Check if the permit has AI score data in raw_data
    const rawData = permit.raw_data as Record<string, unknown> | null;
    if (!rawData || !rawData.ai_score) continue;

    try {
      const score: Omit<AIScore, 'id'> = {
        permit_id: permit.id,
        overall_score: (rawData.ai_score as number) || 0,
        opportunity_rating: (rawData.ai_rating as 'hot' | 'warm' | 'cold' | 'not_relevant') || 'not_relevant',
        project_size_score: (rawData.ai_score as number) || 0, // Use overall as default
        timing_score: 50, // Default middle value
        location_score: 50, // Default middle value
        competition_score: 50, // Default middle value
        reasoning: (rawData.ai_reasoning as string) || '',
        keywords_detected: (rawData.ai_keywords as string[]) || [],
        recommended_actions: (rawData.ai_actions as string[]) || [],
        scored_at: new Date().toISOString(),
      };

      await saveAIScore(score);
      savedCount++;
    } catch (error) {
      console.error(`Failed to save extracted score for permit ${permit.permit_number}:`, error);
    }
  }

  return savedCount;
}

export async function deleteAllPermits(): Promise<{ deleted: number }> {
  // First delete all AI scores (though CASCADE should handle this)
  await supabase.from('ai_scores').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Then delete all permits
  const { data, error } = await supabase
    .from('permits')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select('id');

  if (error) {
    throw new Error(`Failed to delete permits: ${error.message}`);
  }

  return { deleted: data?.length || 0 };
}
