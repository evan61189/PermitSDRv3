/**
 * New Counties Scraper Entry Point
 * Separate from existing scrapers to avoid disruption
 *
 * Supports: Baltimore County, Carroll County
 */

import 'dotenv/config';
import { scrapeBaltimoreCounty } from './scrapers/baltimore-county.js';
import { scrapeCarrollCounty } from './scrapers/carroll-county.js';
import { upsertPermits } from './utils/supabase.js';
import type { DateRange } from './scrapers/index.js';

async function main() {
  console.log('========================================');
  console.log('Permit SDR v3 - New Counties Scraper');
  console.log('Baltimore County & Carroll County');
  console.log('========================================');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  // Parse command line arguments
  const args = process.argv.slice(2);
  let dateRange: DateRange | undefined;

  // Check for date range arguments
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
  }

  // Determine which jurisdictions to scrape
  const jurisdictionArg = args.find(arg => arg.startsWith('--jurisdiction='));
  const jurisdictions = jurisdictionArg
    ? jurisdictionArg.split('=')[1].split(',')
    : ['baltimore_county_md', 'carroll_county_md'];

  console.log(`Scraping jurisdictions: ${jurisdictions.join(', ')}`);
  console.log('');

  const results = [];

  // Run Baltimore County scraper
  if (jurisdictions.includes('baltimore_county_md')) {
    console.log('========================================');
    console.log('Starting Baltimore County scraper...');
    console.log('========================================');
    try {
      const result = await scrapeBaltimoreCounty(dateRange);
      results.push(result);

      if (result.success && result.permits.length > 0) {
        console.log(`\nUpserting ${result.permits.length} Baltimore County permits to database...`);
        await upsertPermits(result.permits);
        console.log('Baltimore County permits saved successfully!');
      } else if (result.permits.length === 0) {
        console.log('No Baltimore County permits found for the date range.');
      }
    } catch (error) {
      console.error('Baltimore County scraper failed:', error);
    }
    console.log('');
  }

  // Run Carroll County scraper
  if (jurisdictions.includes('carroll_county_md')) {
    console.log('========================================');
    console.log('Starting Carroll County scraper...');
    console.log('========================================');
    try {
      const result = await scrapeCarrollCounty(dateRange);
      results.push(result);

      if (result.success && result.permits.length > 0) {
        console.log(`\nUpserting ${result.permits.length} Carroll County permits to database...`);
        await upsertPermits(result.permits);
        console.log('Carroll County permits saved successfully!');
      } else if (result.permits.length === 0) {
        console.log('No Carroll County permits found for the date range.');
      }
    } catch (error) {
      console.error('Carroll County scraper failed:', error);
    }
    console.log('');
  }

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
