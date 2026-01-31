/**
 * Carroll County Scraper Entry Point
 * Separate from existing scrapers to avoid disruption
 *
 * Supports: Carroll County (CR- permits)
 *
 * Usage:
 *   npx tsx src/index-new-counties.ts
 *   npx tsx src/index-new-counties.ts --start-date=2025-01-01 --end-date=2025-01-31
 */

import 'dotenv/config';
import { scrapeCarrollCounty } from './scrapers/carroll-county.js';
import { upsertPermits } from './utils/supabase.js';
import type { DateRange } from './scrapers/index.js';

async function main() {
  console.log('========================================');
  console.log('Permit SDR v3 - Carroll County Scraper');
  console.log('========================================');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  // Parse command line arguments for date range
  const args = process.argv.slice(2);
  let dateRange: DateRange | undefined;

  const startDateArg = args.find(arg => arg.startsWith('--start-date='));
  const endDateArg = args.find(arg => arg.startsWith('--end-date='));

  if (startDateArg && endDateArg) {
    const startDateStr = startDateArg.split('=')[1];
    const endDateStr = endDateArg.split('=')[1];
    dateRange = {
      startDate: new Date(startDateStr),
      endDate: new Date(endDateStr),
    };
    console.log(`Using custom date range: ${startDateStr} to ${endDateStr}`);
  } else if (startDateArg || endDateArg) {
    console.log('Warning: Both --start-date and --end-date must be provided. Using default date range.');
  } else {
    console.log('Using default date range (last 30 days)');
  }
  console.log('');

  const results = [];

  // Run Carroll County scraper
  console.log('========================================');
  console.log('Starting Carroll County scraper...');
  console.log('Searching for Commercial Renovations and Commercial -New permits');
  console.log('Looking for CR- prefixed record numbers');
  console.log('========================================');

  try {
    const result = await scrapeCarrollCounty(dateRange);
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
