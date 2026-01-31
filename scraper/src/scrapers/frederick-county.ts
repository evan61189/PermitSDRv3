import { Page } from 'playwright';
import { getPage } from '../utils/browser.js';
import { extractAndScorePermit, AIExtractedPermit } from '../utils/ai-scorer.js';
import type { Permit, ScraperResult, Jurisdiction } from '../types/index.js';
import type { DateRange } from './index.js';

const JURISDICTION: Jurisdiction = 'frederick_county_md';
const BASE_URL = 'https://planningandpermitting.frederickcountymd.gov/lookup-record';

// Default date range is last 30 days
const DEFAULT_DATE_RANGE_DAYS = 30;

// Permit type to search
const PERMIT_TYPE = 'Non Residential Building Permit';

interface PermitData {
  recordNumber: string;
  detailUrl?: string;
  pageText: string;
  aiData?: AIExtractedPermit;
}

export async function scrapeFrederickcounty(dateRange?: DateRange): Promise<ScraperResult> {
  console.log(`[${JURISDICTION}] Starting scrape...`);
  const permits: Omit<Permit, 'id' | 'created_at' | 'updated_at'>[] = [];
  const seenPermitNumbers = new Set<string>();

  // Calculate date range
  let startDate: Date;
  let endDate: Date;
  if (dateRange) {
    startDate = dateRange.startDate;
    endDate = dateRange.endDate;
  } else {
    endDate = new Date();
    startDate = new Date();
    startDate.setDate(startDate.getDate() - DEFAULT_DATE_RANGE_DAYS);
  }
  console.log(`[${JURISDICTION}] Date range: ${formatDate(startDate)} to ${formatDate(endDate)}`);

  try {
    const { page: browserPage, context } = await getPage();
    const page = browserPage;

    console.log(`[${JURISDICTION}] Navigating to ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Wait for page to fully load (CIVICS is JavaScript-heavy)
    await waitForPageLoad(page);

    // Check the "Non Residential Building Permit" checkbox
    const checkedPermitType = await selectPermitType(page, PERMIT_TYPE);
    if (!checkedPermitType) {
      console.log(`[${JURISDICTION}] Could not find "${PERMIT_TYPE}" checkbox`);
      return {
        jurisdiction: JURISDICTION,
        permits,
        scraped_at: new Date().toISOString(),
        success: false,
        error: `Could not find "${PERMIT_TYPE}" checkbox`,
      };
    }

    // Enter date range
    await enterDateRange(page, startDate, endDate);

    // Click search button
    await clickSearchButton(page);

    // Process results
    const rawPermits = await processPermitResults(page, seenPermitNumbers);
    console.log(`[${JURISDICTION}] Found ${rawPermits.length} permits`);

    // Transform and add permits
    for (const raw of rawPermits) {
      if (raw.aiData) {
        const permit = transformPermit(raw);
        if (permit) {
          permits.push(permit);
          console.log(`[${JURISDICTION}] Added permit: ${permit.permit_number} (Score: ${raw.aiData.overallScore}, Rating: ${raw.aiData.opportunityRating})`);
        }
      }
    }

    await context.close();
    console.log(`[${JURISDICTION}] Scrape complete. Found: ${permits.length} total permits`);

    return {
      jurisdiction: JURISDICTION,
      permits,
      scraped_at: new Date().toISOString(),
      success: true,
    };
  } catch (error) {
    console.error(`[${JURISDICTION}] Error during scrape:`, error);
    return {
      jurisdiction: JURISDICTION,
      permits,
      scraped_at: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function waitForPageLoad(page: Page): Promise<void> {
  console.log(`[${JURISDICTION}] Waiting for page to fully load...`);

  // Wait for any loading indicators to disappear
  try {
    await page.waitForSelector('.loading, .spinner, [class*="loading"]', { state: 'hidden', timeout: 10000 });
  } catch {
    // No loading indicator found, continue
  }

  // Scroll to trigger any lazy loading
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
}

async function selectPermitType(page: Page, permitType: string): Promise<boolean> {
  console.log(`[${JURISDICTION}] Looking for "${permitType}" checkbox...`);

  // Try multiple selectors for the checkbox
  const checkboxSelectors = [
    `input[type="checkbox"][id*="Non"][id*="Residential"]`,
    `input[type="checkbox"][name*="Non"][name*="Residential"]`,
    `input[type="checkbox"][value*="Non Residential"]`,
    `label:has-text("${permitType}") input[type="checkbox"]`,
    `text="${permitType}" >> ../input[type="checkbox"]`,
  ];

  for (const selector of checkboxSelectors) {
    try {
      const checkbox = page.locator(selector).first();
      if (await checkbox.isVisible({ timeout: 2000 })) {
        await checkbox.scrollIntoViewIfNeeded();
        await checkbox.check();
        console.log(`[${JURISDICTION}] Checked "${permitType}" using selector: ${selector}`);
        await page.waitForTimeout(1000);
        return true;
      }
    } catch {
      continue;
    }
  }

  // Try finding by label text and clicking
  try {
    const label = page.locator(`text="${permitType}"`).first();
    if (await label.isVisible({ timeout: 2000 })) {
      await label.click();
      console.log(`[${JURISDICTION}] Clicked label for "${permitType}"`);
      await page.waitForTimeout(1000);
      return true;
    }
  } catch {
    // Continue to next approach
  }

  // Try finding checkbox near the text
  try {
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();

    for (let i = 0; i < count; i++) {
      const checkbox = checkboxes.nth(i);
      try {
        // Get the parent or nearby label text
        const parent = checkbox.locator('xpath=ancestor::label | xpath=following-sibling::label | xpath=preceding-sibling::label').first();
        const text = await parent.textContent();

        if (text && text.toLowerCase().includes('non residential')) {
          await checkbox.scrollIntoViewIfNeeded();
          await checkbox.check();
          console.log(`[${JURISDICTION}] Found and checked checkbox by label text`);
          await page.waitForTimeout(1000);
          return true;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Continue
  }

  // Last resort: look for any element containing the text and try clicking
  try {
    const elements = page.locator(`*:has-text("Non Residential")`);
    const count = await elements.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      const el = elements.nth(i);
      try {
        const tagName = await el.evaluate(e => e.tagName.toLowerCase());
        if (['label', 'span', 'div', 'li'].includes(tagName)) {
          const text = await el.textContent();
          if (text && text.includes('Non Residential') && text.includes('Building')) {
            await el.click();
            console.log(`[${JURISDICTION}] Clicked element containing permit type text`);
            await page.waitForTimeout(1000);
            return true;
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Continue
  }

  console.log(`[${JURISDICTION}] Could not find checkbox for "${permitType}"`);
  return false;
}

async function enterDateRange(page: Page, startDate: Date, endDate: Date): Promise<void> {
  const startDateStr = formatDateForInput(startDate);
  const endDateStr = formatDateForInput(endDate);
  console.log(`[${JURISDICTION}] Entering date range: ${startDateStr} to ${endDateStr}`);

  // Find "Added Date From" field
  const fromSelectors = [
    'input[id*="from" i][id*="date" i]',
    'input[name*="from" i][name*="date" i]',
    'input[placeholder*="from" i]',
    'input[id*="addedDateFrom" i]',
    'input[id*="startDate" i]',
  ];

  for (const selector of fromSelectors) {
    try {
      const fromInput = page.locator(selector).first();
      if (await fromInput.isVisible({ timeout: 2000 })) {
        await fromInput.scrollIntoViewIfNeeded();
        await fromInput.click();
        await fromInput.clear();
        await fromInput.fill(startDateStr);
        console.log(`[${JURISDICTION}] Set "Added Date From": ${startDateStr}`);
        break;
      }
    } catch {
      continue;
    }
  }

  // Try finding by label
  try {
    const fromLabel = page.locator('text=/added date from/i').first();
    if (await fromLabel.isVisible({ timeout: 1000 })) {
      const fromInput = fromLabel.locator('xpath=following::input[1]').first();
      if (await fromInput.isVisible({ timeout: 1000 })) {
        await fromInput.click();
        await fromInput.clear();
        await fromInput.fill(startDateStr);
        console.log(`[${JURISDICTION}] Set "Added Date From" via label: ${startDateStr}`);
      }
    }
  } catch {
    // Continue
  }

  await page.waitForTimeout(500);

  // Find "Added Date To" field
  const toSelectors = [
    'input[id*="to" i][id*="date" i]:not([id*="from" i])',
    'input[name*="to" i][name*="date" i]:not([name*="from" i])',
    'input[placeholder*="to" i]',
    'input[id*="addedDateTo" i]',
    'input[id*="endDate" i]',
  ];

  for (const selector of toSelectors) {
    try {
      const toInput = page.locator(selector).first();
      if (await toInput.isVisible({ timeout: 2000 })) {
        await toInput.scrollIntoViewIfNeeded();
        await toInput.click();
        await toInput.clear();
        await toInput.fill(endDateStr);
        console.log(`[${JURISDICTION}] Set "Added Date To": ${endDateStr}`);
        break;
      }
    } catch {
      continue;
    }
  }

  // Try finding by label
  try {
    const toLabels = page.locator('text=/added date.*to|to.*date/i');
    const count = await toLabels.count();
    for (let i = 0; i < count; i++) {
      const toLabel = toLabels.nth(i);
      const text = await toLabel.textContent();
      if (text && !text.toLowerCase().includes('from')) {
        const toInput = toLabel.locator('xpath=following::input[1]').first();
        if (await toInput.isVisible({ timeout: 1000 })) {
          await toInput.click();
          await toInput.clear();
          await toInput.fill(endDateStr);
          console.log(`[${JURISDICTION}] Set "Added Date To" via label: ${endDateStr}`);
          break;
        }
      }
    }
  } catch {
    // Continue
  }

  await page.waitForTimeout(500);
}

async function clickSearchButton(page: Page): Promise<void> {
  console.log(`[${JURISDICTION}] Looking for search button...`);

  // Scroll down to make sure button is visible
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(1000);

  const buttonSelectors = [
    'button:has-text("Search")',
    'button[type="submit"]:has-text("Search")',
    'input[type="submit"][value*="Search" i]',
    'a:has-text("Search"):not(:has-text("Clear"))',
    'button.btn-primary:has-text("Search")',
    'button[class*="search" i]',
    '*[class*="search-btn" i]',
  ];

  for (const selector of buttonSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 2000 })) {
        await button.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await button.click();
        console.log(`[${JURISDICTION}] Clicked search button using selector: ${selector}`);
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        await page.waitForTimeout(3000);
        return;
      }
    } catch {
      continue;
    }
  }

  // Try finding blue button
  try {
    const blueButtons = page.locator('button[class*="primary"], button[class*="blue"], button[style*="blue"]');
    const count = await blueButtons.count();
    for (let i = 0; i < count; i++) {
      const btn = blueButtons.nth(i);
      const text = await btn.textContent();
      if (text && text.toLowerCase().includes('search')) {
        await btn.click();
        console.log(`[${JURISDICTION}] Clicked blue search button`);
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        await page.waitForTimeout(3000);
        return;
      }
    }
  } catch {
    // Continue
  }

  console.log(`[${JURISDICTION}] Could not find search button`);
}

async function processPermitResults(page: Page, seenPermitNumbers: Set<string>): Promise<PermitData[]> {
  const permits: PermitData[] = [];

  // Scroll to see results
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);

  // Wait for results to load
  try {
    await page.waitForSelector('text=/view details/i', { timeout: 15000 });
  } catch {
    console.log(`[${JURISDICTION}] No "View Details" links found - possibly no results`);
    return permits;
  }

  const baseUrl = page.url();
  let processedCount = 0;
  const maxPermits = 50; // Limit to avoid very long scrapes

  while (processedCount < maxPermits) {
    // Find all "View Details" links/buttons
    const viewDetailsLinks = page.locator('text=/view details/i, a:has-text("View Details"), button:has-text("View Details")');
    const count = await viewDetailsLinks.count();

    if (count === 0) {
      console.log(`[${JURISDICTION}] No more "View Details" links found`);
      break;
    }

    console.log(`[${JURISDICTION}] Found ${count} "View Details" links on current page`);

    // Process each permit on the current page
    for (let i = 0; i < count && processedCount < maxPermits; i++) {
      try {
        // Re-find the links each time as the page might have changed
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);

        const links = page.locator('text=/view details/i, a:has-text("View Details"), button:has-text("View Details")');
        const link = links.nth(i);

        if (!await link.isVisible({ timeout: 3000 })) {
          continue;
        }

        // Try to get a permit identifier from nearby text
        let permitNumber = `FREDERICK-${Date.now()}-${i}`;
        try {
          const row = link.locator('xpath=ancestor::tr | xpath=ancestor::div[contains(@class,"card")] | xpath=ancestor::div[contains(@class,"row")]').first();
          const rowText = await row.textContent();
          // Try to extract a permit/record number
          const numberMatch = rowText?.match(/([A-Z]{2,}-?\d{4,}|\d{4,}-[A-Z]{2,}|\d{6,})/);
          if (numberMatch) {
            permitNumber = numberMatch[1];
          }
        } catch {
          // Use generated number
        }

        // Skip if already processed
        if (seenPermitNumbers.has(permitNumber)) {
          console.log(`[${JURISDICTION}] Skipping duplicate: ${permitNumber}`);
          continue;
        }

        console.log(`[${JURISDICTION}] Processing permit ${processedCount + 1}: ${permitNumber}`);

        await link.scrollIntoViewIfNeeded();
        await link.click();
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        await page.waitForTimeout(2000);

        // Extract permit details using AI
        const permitData = await extractPermitDetails(page, permitNumber);
        permitData.detailUrl = page.url();

        permits.push(permitData);
        seenPermitNumbers.add(permitNumber);
        processedCount++;

        // Navigate back to results
        await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Re-apply search (page might reset)
        await waitForPageLoad(page);

      } catch (error) {
        console.error(`[${JURISDICTION}] Error processing permit:`, error);
        try {
          await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(2000);
        } catch {
          // Continue
        }
      }
    }

    // Check for pagination / next page
    const hasNextPage = await clickNextPage(page);
    if (!hasNextPage) {
      break;
    }
  }

  return permits;
}

async function clickNextPage(page: Page): Promise<boolean> {
  console.log(`[${JURISDICTION}] Checking for next page...`);

  const nextSelectors = [
    'a:has-text("Next")',
    'button:has-text("Next")',
    '[aria-label="Next"]',
    '.pagination-next',
    'a[rel="next"]',
  ];

  for (const selector of nextSelectors) {
    try {
      const nextBtn = page.locator(selector).first();
      if (await nextBtn.isVisible({ timeout: 2000 }) && await nextBtn.isEnabled()) {
        await nextBtn.click();
        await page.waitForLoadState('networkidle', { timeout: 20000 });
        await page.waitForTimeout(2000);
        console.log(`[${JURISDICTION}] Navigated to next page`);
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

async function extractPermitDetails(page: Page, permitNumber: string): Promise<PermitData> {
  const permitData: PermitData = {
    recordNumber: permitNumber,
    pageText: '',
  };

  try {
    // Get full page text for AI extraction
    const pageText = await page.evaluate(() => document.body.innerText);
    permitData.pageText = pageText;
    console.log(`[${JURISDICTION}] Got page text (${pageText.length} chars) for ${permitNumber}`);

    // Use AI to extract and score permit
    const aiData = await extractAndScorePermit(permitNumber, JURISDICTION, pageText);
    permitData.aiData = aiData;

    // Update permit number if AI found a better one
    if (aiData.permitNumber && aiData.permitNumber !== permitNumber) {
      permitData.recordNumber = aiData.permitNumber;
    }

    console.log(`[${JURISDICTION}] AI extracted - Address: "${aiData.address?.substring(0, 40)}...", Score: ${aiData.overallScore}`);

  } catch (error) {
    console.error(`[${JURISDICTION}] Error extracting permit details:`, error);
  }

  return permitData;
}

function transformPermit(raw: PermitData): Omit<Permit, 'id' | 'created_at' | 'updated_at'> | null {
  if (!raw.recordNumber || !raw.aiData) return null;

  const ai = raw.aiData;
  const addressParts = parseAddress(ai.address || '');

  return {
    permit_number: raw.recordNumber,
    description: ai.description || '',
    address: addressParts.street,
    city: addressParts.city || 'Frederick',
    county: 'Frederick County',
    state: 'MD',
    zip_code: addressParts.zip,
    project_type: ai.projectType,
    permit_type: ai.recordType || PERMIT_TYPE,
    status: ai.status || 'Unknown',
    applicant_name: ai.applicantName,
    contractor_name: ai.contractorName,
    estimated_value: ai.estimatedValue,
    square_footage: ai.squareFootage,
    source_url: BASE_URL,
    source_jurisdiction: JURISDICTION,
    detail_url: raw.detailUrl,
    raw_data: {
      ai_score: ai.overallScore,
      ai_rating: ai.opportunityRating,
      ai_reasoning: ai.reasoning,
      ai_keywords: ai.keywordsDetected,
      ai_actions: ai.recommendedActions,
    } as Record<string, unknown>,
  };
}

function parseAddress(address: string): { street: string; city?: string; zip?: string } {
  if (!address) return { street: '' };

  const parts = address.split(',').map(p => p.trim());
  const zipMatch = address.match(/\d{5}(-\d{4})?/);
  const zip = zipMatch ? zipMatch[0].substring(0, 5) : undefined;

  // Common Frederick County cities/areas
  const frederickCountyCities = [
    'Frederick', 'Thurmont', 'Brunswick', 'Emmitsburg', 'Middletown',
    'Walkersville', 'Myersville', 'Woodsboro', 'New Market', 'Libertytown',
    'Burkittsville', 'Point of Rocks', 'Adamstown', 'Buckeystown', 'Jefferson',
    'Knoxville', 'Rosemont', 'Urbana', 'Ballenger Creek', 'Braddock Heights'
  ];

  let city: string | undefined;
  const addressUpper = address.toUpperCase();
  for (const c of frederickCountyCities) {
    if (addressUpper.includes(c.toUpperCase())) {
      city = c;
      break;
    }
  }

  if (parts.length >= 2) {
    return {
      street: parts[0],
      city: city || (parts.length > 2 ? parts[1].replace(/\s*(MD|Maryland)\s*\d{5}.*$/i, '').trim() : undefined),
      zip,
    };
  }

  return { street: address.replace(/,?\s*(MD|Maryland)?\s*\d{5}.*$/i, '').trim(), city, zip };
}

function formatDate(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function formatDateForInput(date: Date): string {
  // Try MM/DD/YYYY format first (common in US)
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}
