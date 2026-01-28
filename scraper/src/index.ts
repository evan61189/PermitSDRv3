import 'dotenv/config';
import { scrapers, scrapeAll } from './scrapers/index.js';
import { closeBrowser } from './utils/browser.js';
import { upsertPermits, getUnscorredPermits, saveAIScore, saveExtractedScores } from './utils/supabase.js';
import { scorePermit } from './utils/ai-scorer.js';
import type { Jurisdiction } from './types/index.js';

async function main() {
  const args = process.argv.slice(2);
  const jurisdictionArg = args.find((arg) => arg.startsWith('--jurisdiction='));
  const jurisdiction = jurisdictionArg?.split('=')[1] as Jurisdiction | undefined;

  const shouldScore = args.includes('--score');
  const scoreOnly = args.includes('--score-only');

  console.log('========================================');
  console.log('Permit SDR Scraper v3');
  console.log('========================================\n');

  try {
    if (!scoreOnly) {
      // Run scrapers
      if (jurisdiction && scrapers[jurisdiction]) {
        console.log(`Running scraper for: ${jurisdiction}`);
        const result = await scrapers[jurisdiction]();

        if (result.success && result.permits.length > 0) {
          console.log(`\nSaving ${result.permits.length} permits to database...`);
          const saved = await upsertPermits(result.permits);
          console.log(`Saved ${saved.length} permits to database`);

          // Save AI scores that were extracted during scraping
          if (saved.length > 0) {
            console.log('Saving AI scores from extraction...');
            const scoresCount = await saveExtractedScores(saved);
            console.log(`Saved ${scoresCount} AI scores`);
          }
        } else if (!result.success) {
          console.error(`Scraper failed: ${result.error}`);
        } else {
          console.log('No permits found');
        }
      } else if (jurisdiction) {
        console.error(`Unknown jurisdiction: ${jurisdiction}`);
        console.log('Available jurisdictions:', Object.keys(scrapers).join(', '));
        process.exit(1);
      } else {
        // Run all scrapers
        console.log('Running all scrapers...\n');
        const results = await scrapeAll();

        let totalPermits = 0;
        const allSaved: any[] = [];
        for (const result of results) {
          if (result.success && result.permits.length > 0) {
            const saved = await upsertPermits(result.permits);
            totalPermits += saved.length;
            allSaved.push(...saved);
          }
        }

        // Save AI scores that were extracted during scraping
        if (allSaved.length > 0) {
          console.log('\nSaving AI scores from extraction...');
          const scoresCount = await saveExtractedScores(allSaved);
          console.log(`Saved ${scoresCount} AI scores`);
        }

        console.log(`\n========================================`);
        console.log(`Total permits saved: ${totalPermits}`);
        console.log('========================================');
      }
    }

    // Run AI scoring if requested (for permits that weren't scored during extraction)
    // NOTE: Most permits are now scored during extraction. This is primarily for
    // re-scoring old permits or handling edge cases where extraction scoring failed.
    if (shouldScore || scoreOnly) {
      console.log('\n========================================');
      console.log('Running AI Scoring (for unscored permits)...');
      console.log('========================================\n');

      const unscored = await getUnscorredPermits(50);

      if (unscored.length === 0) {
        console.log('All permits are already scored!');
      } else {
        console.log(`Found ${unscored.length} unscored permits`);

        for (const permit of unscored) {
          try {
            console.log(`Scoring permit: ${permit.permit_number}`);
            const score = await scorePermit(permit);
            await saveAIScore(score);
            console.log(`  -> Score: ${score.overall_score} (${score.opportunity_rating})`);
          } catch (error) {
            console.error(`  -> Error scoring permit:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await closeBrowser();
  }

  console.log('\nDone!');
}

main();
