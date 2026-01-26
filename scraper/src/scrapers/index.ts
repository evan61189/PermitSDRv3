export { scrapeHowardCounty } from './howard-county.js';
export { scrapeBaltimoreCounty } from './baltimore-county.js';
export { scrapeBaltimoreCityMD } from './baltimore-city.js';
export { scrapeAnneArundelCounty } from './anne-arundel-county.js';
export { scrapeDC } from './dc.js';

import { scrapeHowardCounty } from './howard-county.js';
import { scrapeBaltimoreCounty } from './baltimore-county.js';
import { scrapeBaltimoreCityMD } from './baltimore-city.js';
import { scrapeAnneArundelCounty } from './anne-arundel-county.js';
import { scrapeDC } from './dc.js';
import type { Jurisdiction, ScraperResult } from '../types/index.js';

export type ScraperFunction = () => Promise<ScraperResult>;

export const scrapers: Record<Jurisdiction, ScraperFunction> = {
  howard_county_md: scrapeHowardCounty,
  baltimore_county_md: scrapeBaltimoreCounty,
  baltimore_city_md: scrapeBaltimoreCityMD,
  anne_arundel_county_md: scrapeAnneArundelCounty,
  dc: scrapeDC,
};

export async function scrapeAll(): Promise<ScraperResult[]> {
  const results: ScraperResult[] = [];

  for (const [jurisdiction, scraper] of Object.entries(scrapers)) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Starting scraper for ${jurisdiction}`);
    console.log('='.repeat(50));

    try {
      const result = await scraper();
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
