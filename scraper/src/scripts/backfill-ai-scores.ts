/**
 * Backfill AI Scores Script
 *
 * This script finds permits that have AI score data in their raw_data field
 * but don't have a corresponding entry in the ai_scores table, and creates
 * those entries.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-ai-scores.ts
 *   npx tsx src/scripts/backfill-ai-scores.ts --dry-run
 *   npx tsx src/scripts/backfill-ai-scores.ts --jurisdiction=carroll_county_md
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import type { AIScore, Jurisdiction } from '../types/index.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface PermitWithRawData {
  id: string;
  permit_number: string;
  source_jurisdiction: Jurisdiction;
  raw_data: {
    ai_score?: number;
    ai_rating?: 'hot' | 'warm' | 'cold' | 'not_relevant';
    ai_reasoning?: string;
    ai_keywords?: string[];
    ai_actions?: string[];
  } | null;
}

async function backfillAIScores(options: { dryRun: boolean; jurisdiction?: string }) {
  console.log('========================================');
  console.log('AI Scores Backfill Script');
  console.log('========================================');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  if (options.jurisdiction) {
    console.log(`Filtering by jurisdiction: ${options.jurisdiction}`);
  }
  console.log('');

  // Find permits with AI data in raw_data but no ai_scores entry
  let query = supabase
    .from('permits')
    .select(`
      id,
      permit_number,
      source_jurisdiction,
      raw_data,
      ai_scores(id)
    `)
    .not('raw_data', 'is', null)
    .not('raw_data->ai_score', 'is', null)
    .is('ai_scores', null);

  if (options.jurisdiction) {
    query = query.eq('source_jurisdiction', options.jurisdiction);
  }

  const { data: permits, error } = await query;

  if (error) {
    console.error('Error fetching permits:', error.message);
    process.exit(1);
  }

  if (!permits || permits.length === 0) {
    console.log('No permits found that need AI score backfill.');
    console.log('All permits with AI data already have ai_scores entries.');
    return;
  }

  console.log(`Found ${permits.length} permits that need AI score backfill:`);
  console.log('');

  // Group by jurisdiction for summary
  const byJurisdiction: Record<string, number> = {};
  for (const permit of permits) {
    const jurisdiction = permit.source_jurisdiction;
    byJurisdiction[jurisdiction] = (byJurisdiction[jurisdiction] || 0) + 1;
  }

  console.log('Permits by jurisdiction:');
  for (const [jurisdiction, count] of Object.entries(byJurisdiction)) {
    console.log(`  - ${jurisdiction}: ${count}`);
  }
  console.log('');

  if (options.dryRun) {
    console.log('DRY RUN - Would create the following AI scores:');
    console.log('');
    for (const permit of permits.slice(0, 10)) {
      const rawData = permit.raw_data as PermitWithRawData['raw_data'];
      console.log(`  ${permit.permit_number} (${permit.source_jurisdiction})`);
      console.log(`    Score: ${rawData?.ai_score || 0}, Rating: ${rawData?.ai_rating || 'not_relevant'}`);
    }
    if (permits.length > 10) {
      console.log(`  ... and ${permits.length - 10} more`);
    }
    console.log('');
    console.log('Run without --dry-run to create these entries.');
    return;
  }

  // Create AI score entries
  let successCount = 0;
  let errorCount = 0;

  for (const permit of permits) {
    const rawData = permit.raw_data as PermitWithRawData['raw_data'];
    if (!rawData) continue;

    try {
      const score: Omit<AIScore, 'id'> = {
        permit_id: permit.id,
        overall_score: rawData.ai_score || 0,
        opportunity_rating: rawData.ai_rating || 'not_relevant',
        project_size_score: rawData.ai_score || 0,
        timing_score: 50,
        location_score: 50,
        competition_score: 50,
        reasoning: rawData.ai_reasoning || '',
        keywords_detected: rawData.ai_keywords || [],
        recommended_actions: rawData.ai_actions || [],
        scored_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from('ai_scores')
        .upsert(score, { onConflict: 'permit_id' });

      if (insertError) {
        console.error(`  Error creating score for ${permit.permit_number}: ${insertError.message}`);
        errorCount++;
      } else {
        console.log(`  Created score for ${permit.permit_number} (Score: ${score.overall_score}, Rating: ${score.opportunity_rating})`);
        successCount++;
      }
    } catch (err) {
      console.error(`  Error processing ${permit.permit_number}:`, err);
      errorCount++;
    }
  }

  console.log('');
  console.log('========================================');
  console.log('BACKFILL COMPLETE');
  console.log('========================================');
  console.log(`Finished at: ${new Date().toISOString()}`);
  console.log(`Successfully created: ${successCount} AI scores`);
  console.log(`Errors: ${errorCount}`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const jurisdictionArg = args.find(arg => arg.startsWith('--jurisdiction='));
const jurisdiction = jurisdictionArg ? jurisdictionArg.split('=')[1] : undefined;

backfillAIScores({ dryRun, jurisdiction }).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
