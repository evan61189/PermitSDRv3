/**
 * New Counties Scraper Entry Point
 * Separate from existing Accela-based scrapers
 *
 * Supports:
 *   - Carroll County (Accela - CR-/CN- permits)
 *   - Frederick County (CIVICS - Non Residential Building Permits)
 *
 * Usage:
 *   npx tsx src/index-new-counties.ts
 *   npx tsx src/index-new-counties.ts --start-date=2025-01-01 --end-date=2025-01-31
 *   npx tsx src/index-new-counties.ts --jurisdiction=carroll_county_md
 *   npx tsx src/index-new-counties.ts --jurisdiction=frederick_county_md
 */

import 'dotenv/config';
import { scrapeCarrollCounty } from './scrapers/carroll-county.js';
import { scrapeFrederickcounty } from './scrapers/frederick-county.js';
import { upsertPermits, saveExtractedScores } from './utils/supabase.js';
import type { DateRange } from './scrapers/index.js';
import type { ScraperResult } from './types/index.js';

type ScraperFunction = (dateRange?: DateRange) => Promise<ScraperResult>;

const scrapers: Record<string, { scraper: ScraperFunction; description: string }> = {
  carroll_county_md: {
    scraper: scrapeCarrollCounty,
    description: 'Carroll County - Commercial Renovations (CR-) and Commercial New (CN-)',
  },
  frederick_county_md: {
    scraper: scrapeFrederickcounty,
    description: 'Frederick County - Non Residential Building Permits',
  },
};

async function main() {
  console.log('========================================');
  console.log('Permit SDR v3 - New Counties Scraper');
  console.log('Carroll County & Frederick County');
  console.log('========================================');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  // Parse command line arguments
  const args = process.argv.slice(2);
  let dateRange: DateRange | undefined;

  const startDateArg = args.find(arg => arg.startsWith('--start-date='));
  const endDateArg = args.find(arg => arg.startsWith('--end-date='));
  const jurisdictionArg = args.find(arg => arg.startsWith('--jurisdiction='));

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

  // Determine which jurisdictions to scrape
  const jurisdictionsToScrape = jurisdictionArg
    ? [jurisdictionArg.split('=')[1]]
    : Object.keys(scrapers);

  console.log(`Jurisdictions to scrape: ${jurisdictionsToScrape.join(', ')}`);
  console.log('');

  const results: ScraperResult[] = [];

  for (const jurisdiction of jurisdictionsToScrape) {
    const scraperConfig = scrapers[jurisdiction];
    if (!scraperConfig) {
      console.log(`Unknown jurisdiction: ${jurisdiction}, skipping...`);
      continue;
    }

    console.log('========================================');
    console.log(`Starting ${jurisdiction} scraper...`);
    console.log(scraperConfig.description);
    console.log('========================================');

    try {
      const result = await scraperConfig.scraper(dateRange);
      results.push(result);

      if (result.success && result.permits.length > 0) {
        console.log(`\nUpserting ${result.permits.length} ${jurisdiction} permits to database...`);
        const savedPermits = await upsertPermits(result.permits);
        console.log(`${jurisdiction} permits saved successfully!`);

        // Save AI scores to the ai_scores table
        if (savedPermits.length > 0) {
          console.log('Saving AI scores to database...');
          const scoresCount = await saveExtractedScores(savedPermits);
          console.log(`Saved ${scoresCount} AI scores`);
        }
      } else if (result.permits.length === 0) {
        console.log(`No ${jurisdiction} permits found.`);
      }
    } catch (error) {
      console.error(`${jurisdiction} scraper failed:`, error);
      results.push({
        jurisdiction: jurisdiction as any,
        permits: [],
        scraped_at: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  // A single county portal being temporarily unavailable (e.g. Frederick's
  // "Service unavailable") or changing its page structure should NOT fail the
  // whole scheduled job. Failing the job creates noisy alerts and can halt the
  // pipeline even though the other counties scraped fine. Only exit non-zero on
  // a *systemic* failure -- every jurisdiction failed -- which points at a real
  // problem (DB write outage, bad credentials, or a code error) rather than one
  // flaky government website.
  const systemicFailure = succeeded.length === 0 && failed.length > 0;

  console.log('');
  console.log(`Total permits scraped: ${totalPermits}`);
  console.log(`Jurisdictions succeeded: ${succeeded.length}/${results.length}`);
  if (failed.length > 0) {
    console.log(`Jurisdictions with issues: ${failed.map(r => `${r.jurisdiction} (${r.error ?? 'unknown error'})`).join(', ')}`);
  }
  console.log(`Overall status: ${systemicFailure ? 'FAILED' : failed.length > 0 ? 'PARTIAL' : 'SUCCESS'}`);

  process.exit(systemicFailure ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
/**
 * New Counties Scraper Entry Point
 * Separate from existing Accela-based scrapers
 *
 * Supports:
 *   - Carroll County (Accela - CR-/CN- permits)
 *   - Frederick County (CIVICS - Non Residential Building Permits)
 *
 * Usage:
 *   npx tsx src/index-new-counties.ts
 *   npx tsx src/index-new-counties.ts --start-date=2025-01-01 --end-date=2025-01-31
 *   npx tsx src/index-new-counties.ts --jurisdiction=carroll_county_md
 *   npx tsx src/index-new-counties.ts --jurisdiction=frederick_county_md
 */

import 'dotenv/config';
import { scrapeCarrollCounty } from './scrapers/carroll-county.js';
import { scrapeFrederickcounty } from './scrapers/frederick-county.js';
import { upsertPermits, saveExtractedScores } from './utils/supabase.js';
import type { DateRange } from './scrapers/index.js';
import type { ScraperResult } from './types/index.js';

type ScraperFunction = (dateRange?: DateRange) => Promise<ScraperResult>;

const scrapers: Record<string, { scraper: ScraperFunction; description: string }> = {
  carroll_county_md: {
    scraper: scrapeCarrollCounty,
    description: 'Carroll County - Commercial Renovations (CR-) and Commercial New (CN-)',
  },
  frederick_county_md: {
    scraper: scrapeFrederickcounty,
    description: 'Frederick County - Non Residential Building Permits',
  },
};

async function main() {
  console.log('========================================');
  console.log('Permit SDR v3 - New Counties Scraper');
  console.log('Carroll County & Frederick County');
  console.log('========================================');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  // Parse command line arguments
  const args = process.argv.slice(2);
  let dateRange: DateRange | undefined;

  const startDateArg = args.find(arg => arg.startsWith('--start-date='));
  const endDateArg = args.find(arg => arg.startsWith('--end-date='));
  const jurisdictionArg = args.find(arg => arg.startsWith('--jurisdiction='));

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

  // Determine which jurisdictions to scrape
  const jurisdictionsToScrape = jurisdictionArg
    ? [jurisdictionArg.split('=')[1]]
    : Object.keys(scrapers);

  console.log(`Jurisdictions to scrape: ${jurisdictionsToScrape.join(', ')}`);
  console.log('');

  const results: ScraperResult[] = [];

  for (const jurisdiction of jurisdictionsToScrape) {
    const scraperConfig = scrapers[jurisdiction];
    if (!scraperConfig) {
      console.log(`Unknown jurisdiction: ${jurisdiction}, skipping...`);
      continue;
    }

    console.log('========================================');
    console.log(`Starting ${jurisdiction} scraper...`);
    console.log(scraperConfig.description);
    console.log('========================================');

    try {
      const result = await scraperConfig.scraper(dateRange);
      results.push(result);

      if (result.success && result.permits.length > 0) {
        console.log(`\nUpserting ${result.permits.length} ${jurisdiction} permits to database...`);
        const savedPermits = await upsertPermits(result.permits);
        console.log(`${jurisdiction} permits saved successfully!`);

        // Save AI scores to the ai_scores table
        if (savedPermits.length > 0) {
          console.log('Saving AI scores to database...');
          const scoresCount = await saveExtractedScores(savedPermits);
          console.log(`Saved ${scoresCount} AI scores`);
        }
      } else if (result.permits.length === 0) {
        console.log(`No ${jurisdiction} permits found.`);
      }
    } catch (error) {
      console.error(`${jurisdiction} scraper failed:`, error);
      results.push({
        jurisdiction: jurisdiction as any,
        permits: [],
        scraped_at: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
