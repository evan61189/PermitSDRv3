export { scrapeHowardCounty } from './howard-county.js';
export { scrapeBaltimoreCityMD } from './baltimore-city.js';
export { scrapeAnneArundelCounty } from './anne-arundel-county.js';

import { scrapeHowardCounty } from './howard-county.js';
import { scrapeBaltimoreCityMD } from './baltimore-city.js';
import { scrapeAnneArundelCounty } from './anne-arundel-county.js';
import type { Jurisdiction, ScraperResult } from '../types/index.js';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export type ScraperFunction = (dateRange?: DateRange) => Promise<ScraperResult>;

export const scrapers: Record<Jurisdiction, ScraperFunction> = {
  howard_county_md: scrapeHowardCounty,
  baltimore_city_md: scrapeBaltimoreCityMD,
  anne_arundel_county_md: scrapeAnneArundelCounty,
};

export async function scrapeAll(dateRange?: DateRange): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];

  for (const [jurisdiction, scraper] of Object.entries(scrapers)) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Starting scraper for ${jurisdiction}`);
    console.log('='.repeat(50));

    try {
      const result = await scraper(dateRange);
      results.push(result);

      if (result.success) {
        console.log(`✓ ${jurisdiction}: ${result.permits.length} relevant permits scraped`);
      } else {
        console.log(`✗ ${jurisdiction}: Failed - ${result.error}`);
      }
    } catch (error) {
      console.error(`✗ ${jurisdiction}: Unexpected error -`, error);
      results.push({
        jurisdiction: jurisdiction as Jurisdiction,
        permits: [],
        scraped_at: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  }

  return results;
}
