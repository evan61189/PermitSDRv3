/**
 * Re-geocode permits that are missing latitude/longitude coordinates.
 * Run with: npx tsx src/scripts/regeocode-permits.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { geocodeAddress } from '../utils/geocoder.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function regeocodePermits() {
  console.log('========================================');
  console.log('Re-geocoding permits with missing coordinates');
  console.log('========================================\n');

  // Fetch permits without coordinates
  const { data: permits, error } = await supabase
    .from('permits')
    .select('id, permit_number, address, city, county, state, zip_code, source_jurisdiction')
    .or('latitude.is.null,longitude.is.null')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching permits:', error);
    process.exit(1);
  }

  if (!permits || permits.length === 0) {
    console.log('All permits already have coordinates!');
    return;
  }

  console.log(`Found ${permits.length} permits without coordinates\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < permits.length; i++) {
    const permit = permits[i];
    console.log(`[${i + 1}/${permits.length}] ${permit.permit_number}: ${permit.address}, ${permit.city || permit.county}`);

    if (!permit.address || permit.address.length < 5) {
      console.log('  -> Skipping: No valid address');
      failCount++;
      continue;
    }

    try {
      const coords = await geocodeAddress(
        permit.address,
        permit.city || '',
        permit.state || 'MD',
        permit.zip_code,
        permit.county
      );

      if (coords) {
        // Update the permit with coordinates
        const { error: updateError } = await supabase
          .from('permits')
          .update({
            latitude: coords.latitude,
            longitude: coords.longitude,
            updated_at: new Date().toISOString(),
          })
          .eq('id', permit.id);

        if (updateError) {
          console.log(`  -> Error updating: ${updateError.message}`);
          failCount++;
        } else {
          console.log(`  -> Geocoded: (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`);
          successCount++;
        }
      } else {
        console.log('  -> No geocoding results found');
        failCount++;
      }
    } catch (err) {
      console.log(`  -> Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      failCount++;
    }
  }

  console.log('\n========================================');
  console.log(`Re-geocoding complete!`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log('========================================');
}

regeocodePermits().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
