/**
 * Carroll County Scraper Entry Point
 * Separate from existing scrapers to avoid disruption
 *
 * Supports: Carroll County (CR- permits)
 */

import 'dotenv/config';
import { scrapeCarrollCounty } from './scrapers/carroll-county.js';
import { upsertPermits } from './utils/supabase.js';

async function main() {
  console.log('========================================');
  console.log('Permit SDR v3 - Carroll County Scraper');
  console.log('========================================');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  const results = [];

  // Run Carroll County scraper
  console.log('========================================');
  console.log('Starting Carroll County scraper...');
  console.log('Searching for Commercial Renovations and Commercial -New permits');
  console.log('Looking for CR- prefixed record numbers');
  console.log('========================================');

  try {
    const result = await scrapeCarrollCounty();
    results.push(result);

    if (result.success && result.permits.length > 0) {
      console.log(`\nUpserting ${result.permits.length} Carroll County permits to database...`);
      await upsertPermits(result.permits);
      console.log('Carroll County permits saved successfully!');
    } else if (result.permits.length === 0) {
      console.log('No Carroll County CR- permits found.');
    }
  } catch (error) {
    console.error('Carroll County scraper failed:', error);
  }
  console.log('');

  // Summary
  console.log('========================================');
  console.log('SCRAPING COMPLETE');
  console.log('========================================');
  console.log(`Finished at: ${new Date().toISOString()}`);
  console.log('');

  for (const result of results) {
    const status = result.success ? 'SUCCESS' : 'FAILED';
    console.log(`${result.jurisdiction}: ${status} - ${result.permits.length} permits`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  const totalPermits = results.reduce((sum, r) => sum + r.permits.length, 0);
  const allSuccess = results.every(r => r.success);

  console.log('');
  console.log(`Total permits scraped: ${totalPermits}`);
  console.log(`Overall status: ${allSuccess ? 'SUCCESS' : 'PARTIAL/FAILED'}`);

  process.exit(allSuccess ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
