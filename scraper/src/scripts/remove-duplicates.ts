import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface DuplicateGroup {
  permit_number: string;
  source_jurisdiction: string;
  count: number;
  ids: string[];
  created_ats: string[];
}

async function findDuplicates(jurisdiction?: string): Promise<DuplicateGroup[]> {
  console.log('Finding duplicate permits...');

  let query = supabase
    .from('permits')
    .select('id, permit_number, source_jurisdiction, created_at, description');

  if (jurisdiction) {
    query = query.eq('source_jurisdiction', jurisdiction);
  }

  const { data: permits, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching permits:', error);
    throw error;
  }

  // Group by permit_number + jurisdiction
  const groups = new Map<string, { ids: string[]; created_ats: string[]; descriptions: (string | null)[] }>();

  for (const permit of permits || []) {
    const key = `${permit.permit_number}|${permit.source_jurisdiction}`;
    const existing = groups.get(key) || { ids: [], created_ats: [], descriptions: [] };
    existing.ids.push(permit.id);
    existing.created_ats.push(permit.created_at);
    existing.descriptions.push(permit.description);
    groups.set(key, existing);
  }

  // Find groups with more than one permit
  const duplicates: DuplicateGroup[] = [];
  for (const [key, value] of groups.entries()) {
    if (value.ids.length > 1) {
      const [permit_number, source_jurisdiction] = key.split('|');
      duplicates.push({
        permit_number,
        source_jurisdiction,
        count: value.ids.length,
        ids: value.ids,
        created_ats: value.created_ats,
      });
    }
  }

  return duplicates;
}

async function removeDuplicates(duplicates: DuplicateGroup[], dryRun: boolean): Promise<number> {
  let totalRemoved = 0;

  for (const group of duplicates) {
    // Keep the first one (most recent due to ordering), delete the rest
    const idsToDelete = group.ids.slice(1);

    console.log(`\n${group.permit_number} (${group.source_jurisdiction}):`);
    console.log(`  - Found ${group.count} duplicates`);
    console.log(`  - Keeping: ${group.ids[0]} (created: ${group.created_ats[0]})`);
    console.log(`  - Deleting: ${idsToDelete.length} older records`);

    if (!dryRun) {
      // First delete associated ai_scores
      const { error: scoresError } = await supabase
        .from('ai_scores')
        .delete()
        .in('permit_id', idsToDelete);

      if (scoresError) {
        console.error(`  Error deleting AI scores for ${group.permit_number}:`, scoresError);
        continue;
      }

      // Then delete the duplicate permits
      const { error: permitsError } = await supabase
        .from('permits')
        .delete()
        .in('id', idsToDelete);

      if (permitsError) {
        console.error(`  Error deleting duplicates for ${group.permit_number}:`, permitsError);
        continue;
      }

      console.log(`  ✓ Deleted ${idsToDelete.length} duplicates`);
    } else {
      console.log(`  [DRY RUN] Would delete ${idsToDelete.length} duplicates`);
    }

    totalRemoved += idsToDelete.length;
  }

  return totalRemoved;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const jurisdictionArg = args.find(a => a.startsWith('--jurisdiction='));
  const jurisdiction = jurisdictionArg?.split('=')[1];

  console.log('='.repeat(60));
  console.log('Remove Duplicate Permits Script');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will delete duplicates)'}`);
  if (jurisdiction) {
    console.log(`Jurisdiction filter: ${jurisdiction}`);
  }
  console.log('');

  try {
    const duplicates = await findDuplicates(jurisdiction);

    if (duplicates.length === 0) {
      console.log('No duplicate permits found!');
      return;
    }

    console.log(`Found ${duplicates.length} permit numbers with duplicates:`);

    const totalDuplicateRecords = duplicates.reduce((sum, d) => sum + d.count - 1, 0);
    console.log(`Total duplicate records to remove: ${totalDuplicateRecords}`);

    const removed = await removeDuplicates(duplicates, dryRun);

    console.log('\n' + '='.repeat(60));
    if (dryRun) {
      console.log(`DRY RUN COMPLETE: Would remove ${removed} duplicate records`);
      console.log('Run without --dry-run to actually delete duplicates');
    } else {
      console.log(`COMPLETE: Removed ${removed} duplicate records`);
    }
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
