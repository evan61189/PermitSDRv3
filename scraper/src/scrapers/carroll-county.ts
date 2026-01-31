import { Page } from 'playwright';
import { getPage } from '../utils/browser.js';
import { extractAndScorePermit, AIExtractedPermit } from '../utils/ai-scorer.js';
import type { Permit, ScraperResult, Jurisdiction } from '../types/index.js';
import type { DateRange } from './index.js';

const JURISDICTION: Jurisdiction = 'carroll_county_md';
const BASE_URL = 'https://amprod.carrollcountymd.gov/CitizenAccess/Cap/CapHome.aspx?module=Permits&TabName=Permits&TabList=HOME%7C0%7CPermits%7C1%7CPlanning%7C2%7CLICENSES%7C3%7CCurrentTabIndex%7C1';

// Default date range is last 30 days (commercial permits don't come in as frequently)
const DEFAULT_DATE_RANGE_DAYS = 30;

// Permit types to search for CR- prefixed records
const PERMIT_TYPES_TO_SEARCH = [
  'Commercial Renovations',
  'Commercial - new',
];
const RECORD_PREFIX = 'CR-';

interface PermitData {
  recordNumber: string;
  detailUrl?: string;
  pageText: string;
  aiData?: AIExtractedPermit;
}

export async function scrapeCarrollCounty(dateRange?: DateRange): Promise<ScraperResult> {
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

    // Loop through each permit type
    for (const permitType of PERMIT_TYPES_TO_SEARCH) {
      console.log(`[${JURISDICTION}] ========================================`);
      console.log(`[${JURISDICTION}] Searching for: ${permitType}`);
      console.log(`[${JURISDICTION}] ========================================`);

      try {
        // Navigate to the page (fresh start for each permit type)
        console.log(`[${JURISDICTION}] Navigating to ${BASE_URL}`);
        await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(2000);

        // Handle disclaimer if present
        await handleDisclaimer(page);

        // Select permit type from dropdown
        const foundType = await selectPermitType(page, permitType);
        if (!foundType) {
          console.log(`[${JURISDICTION}] Permit type "${permitType}" not found in dropdown, skipping...`);
          continue;
        }

        // Enter date range
        await enterDateRange(page, startDate, endDate);

        // Click the search button
        await clickSearchButton(page);

        // Process results, looking for CR- prefixed records
        const rawPermits = await processPermitResults(page, seenPermitNumbers);
        console.log(`[${JURISDICTION}] Found ${rawPermits.length} CR- permits for "${permitType}"`);

        // Transform and add permits
        for (const raw of rawPermits) {
          if (raw.aiData) {
            const permit = transformPermit(raw, permitType);
            if (permit) {
              permits.push(permit);
              console.log(`[${JURISDICTION}] Added permit: ${permit.permit_number} (Score: ${raw.aiData.overallScore}, Rating: ${raw.aiData.opportunityRating})`);
            }
          }
        }
      } catch (typeError) {
        console.error(`[${JURISDICTION}] Error searching for "${permitType}":`, typeError);
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

async function handleDisclaimer(page: Page): Promise<void> {
  try {
    const acceptButton = page.locator('input[value*="Accept"], button:has-text("Accept"), a:has-text("Accept"), input[value*="agree" i]').first();
    if (await acceptButton.isVisible({ timeout: 3000 })) {
      console.log(`[${JURISDICTION}] Accepting disclaimer...`);
      await acceptButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
  } catch {
    console.log(`[${JURISDICTION}] No disclaimer found, continuing...`);
  }
}

async function scrollToRenderPage(page: Page): Promise<void> {
  console.log(`[${JURISDICTION}] Scrolling to fully render page...`);

  for (let i = 0; i < 10; i++) {
    await page.evaluate((step) => window.scrollBy(0, step), 500);
    await page.waitForTimeout(300);
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

async function selectPermitType(page: Page, permitType: string): Promise<boolean> {
  console.log(`[${JURISDICTION}] Looking for permit type dropdown...`);

  await scrollToRenderPage(page);

  // Scroll to middle of page where dropdowns typically are
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.evaluate((y) => window.scrollTo(0, y), Math.floor(pageHeight * 0.25));
  await page.waitForTimeout(1000);

  let dropdown = null;

  // Method 1: Find by common Accela dropdown IDs
  const accelaSelectors = [
    'select[id*="ddlPermitType"]',
    'select[id*="PermitType"]',
    'select[id*="ddlRecordType"]',
    'select[id*="RecordType"]',
    'select[id*="Type"]',
  ];

  for (const selector of accelaSelectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 2000 })) {
        dropdown = el;
        console.log(`[${JURISDICTION}] Found dropdown with selector: ${selector}`);
        break;
      }
    } catch {
      continue;
    }
  }

  // Method 2: Find dropdown containing option with matching text
  if (!dropdown) {
    console.log(`[${JURISDICTION}] Scanning all dropdowns for matching options...`);
    const allSelects = page.locator('select');
    const count = await allSelects.count();
    const keywords = permitType.toLowerCase().split(' ').filter(w => w.length > 3);

    for (let i = 0; i < count; i++) {
      const select = allSelects.nth(i);
      try {
        if (!await select.isVisible()) continue;
        const options = await select.locator('option').allTextContents();
        const hasMatch = options.some(opt => {
          const optLower = opt.toLowerCase();
          return keywords.some(kw => optLower.includes(kw));
        });
        if (hasMatch) {
          dropdown = select;
          console.log(`[${JURISDICTION}] Found dropdown by option content at index ${i}`);
          break;
        }
      } catch {
        continue;
      }
    }
  }

  // Select the option
  if (dropdown) {
    try {
      await dropdown.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      const options = await dropdown.locator('option').allTextContents();
      console.log(`[${JURISDICTION}] Available options: ${options.join(', ')}`);

      // Find matching option (case insensitive)
      const exactMatch = options.find(opt => opt.trim().toLowerCase() === permitType.toLowerCase());
      const keywords = permitType.toLowerCase().split(' ').filter(w => w.length > 3);
      const keywordMatch = options.find(opt => {
        const optLower = opt.toLowerCase();
        return keywords.every(kw => optLower.includes(kw));
      });
      const partialMatch = options.find(opt => opt.toLowerCase().includes(permitType.toLowerCase()));

      const targetOption = exactMatch || keywordMatch || partialMatch;

      if (targetOption) {
        console.log(`[${JURISDICTION}] Selecting: "${targetOption}"`);
        await dropdown.selectOption({ label: targetOption });
        await page.waitForTimeout(2000);
        return true;
      } else {
        console.log(`[${JURISDICTION}] Warning: Could not find option "${permitType}"`);
        return false;
      }
    } catch (error) {
      console.log(`[${JURISDICTION}] Error selecting dropdown: ${error}`);
      return false;
    }
  } else {
    console.log(`[${JURISDICTION}] Warning: No permit type dropdown found`);
    return false;
  }
}

async function clickSearchButton(page: Page): Promise<void> {
  console.log(`[${JURISDICTION}] Looking for search button...`);

  // Scroll to bottom where search button typically is
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);

  // Accela-specific red search button selectors
  const accelaButtonSelectors = [
    'a.ACA_LgButton.ACA_LgButton_FontSize:has-text("Search")',
    'a.ACA_LgButton:has-text("Search")',
    'a[class*="ACA_LgButton"]:has-text("Search")',
    'a[id*="lnkSearch"]',
    'a[id$="_lnkSearch"]',
  ];

  for (const selector of accelaButtonSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 2000 })) {
        console.log(`[${JURISDICTION}] Found search button with selector: ${selector}`);
        await button.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await button.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
        return;
      }
    } catch {
      continue;
    }
  }

  // Fallback: generic search selectors
  const genericSelectors = [
    'a:has-text("Search"):not(:has-text("Clear"))',
    'button:has-text("Search")',
    'input[type="submit"][value*="Search" i]',
  ];

  for (const selector of genericSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 1000 })) {
        console.log(`[${JURISDICTION}] Found search button with generic selector: ${selector}`);
        await button.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
        return;
      }
    } catch {
      continue;
    }
  }

  console.log(`[${JURISDICTION}] No search button found, pressing Enter as fallback`);
  await page.keyboard.press('Enter');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
}

async function processPermitResults(page: Page, seenPermitNumbers: Set<string>): Promise<PermitData[]> {
  const permits: PermitData[] = [];
  let currentPage = 1;

  // Scroll to see results
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);

  // Wait for results table
  try {
    await page.waitForSelector('table tbody tr, .ACA_Grid tr, [id*="GridView"] tr', { timeout: 15000 });
  } catch {
    console.log(`[${JURISDICTION}] No results table found`);
    return permits;
  }

  const baseResultsUrl = page.url();
  console.log(`[${JURISDICTION}] Base results URL: ${baseResultsUrl}`);

  while (true) {
    console.log(`[${JURISDICTION}] Processing page ${currentPage}...`);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    // Get all permit links, filtering for CR- prefix
    const permitLinks = await page.$$eval('table tbody tr a, .ACA_Grid tr a, [id*="GridView"] a', (links, prefix) =>
      links
        .filter(a => {
          const text = a.textContent?.trim() || '';
          // Only include links that start with CR-
          return text.startsWith(prefix);
        })
        .map(a => a.textContent!.trim()),
      RECORD_PREFIX
    );

    const uniquePermitLinks = [...new Set(permitLinks)];
    console.log(`[${JURISDICTION}] Found ${uniquePermitLinks.length} ${RECORD_PREFIX} permit links on page ${currentPage}`);

    for (let i = 0; i < uniquePermitLinks.length; i++) {
      const permitNumber = uniquePermitLinks[i];

      // Skip if already seen
      if (seenPermitNumbers.has(permitNumber)) {
        console.log(`[${JURISDICTION}] Skipping duplicate: ${permitNumber}`);
        continue;
      }

      console.log(`[${JURISDICTION}] Processing ${i + 1}/${uniquePermitLinks.length}: ${permitNumber}`);

      try {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);

        const link = page.locator(`a:has-text("${permitNumber}")`).first();
        if (!await link.isVisible({ timeout: 5000 })) {
          console.log(`[${JURISDICTION}] Permit link ${permitNumber} not visible, recovering...`);
          await page.goto(baseResultsUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(2000);
          await navigateToPage(page, currentPage);
          continue;
        }

        await link.scrollIntoViewIfNeeded();
        await link.click();
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        await page.waitForTimeout(2000);

        // Extract permit details using AI
        const permitData = await extractPermitDetails(page, permitNumber);
        permitData.detailUrl = page.url();

        permits.push(permitData);
        seenPermitNumbers.add(permitNumber);

        // Navigate back to results
        await page.goto(baseResultsUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        if (currentPage > 1) {
          await navigateToPage(page, currentPage);
        }

        try {
          await page.waitForSelector('table tbody tr, .ACA_Grid tr, [id*="GridView"] tr', { timeout: 15000 });
        } catch {
          console.log(`[${JURISDICTION}] Results table not found after navigation`);
        }

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);

      } catch (error) {
        console.error(`[${JURISDICTION}] Error processing permit ${permitNumber}:`, error);
        try {
          await page.goto(baseResultsUrl, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(2000);
          if (currentPage > 1) {
            await navigateToPage(page, currentPage);
          }
        } catch (navError) {
          console.error(`[${JURISDICTION}] Failed to recover navigation:`, navError);
        }
      }
    }

    // Check for next page
    const hasNextPage = await checkAndClickNextPage(page);
    if (!hasNextPage) {
      console.log(`[${JURISDICTION}] No more pages to process`);
      break;
    }

    currentPage++;
    await page.waitForTimeout(2000);
  }

  return permits;
}

async function navigateToPage(page: Page, targetPage: number): Promise<void> {
  if (targetPage <= 1) return;

  console.log(`[${JURISDICTION}] Navigating to page ${targetPage}...`);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  for (let p = 1; p < targetPage; p++) {
    const nextPageNum = p + 1;
    console.log(`[${JURISDICTION}] Clicking to page ${nextPageNum}...`);

    try {
      const pageLink = page.locator(`td.aca_pagination_td a:has-text("${nextPageNum}")`).first();
      if (await pageLink.isVisible({ timeout: 3000 })) {
        await pageLink.click();
        await page.waitForLoadState('networkidle', { timeout: 20000 });
        await page.waitForTimeout(1500);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);
        continue;
      }

      const nextBtn = page.locator('a:has-text("Next"):not([disabled])').first();
      if (await nextBtn.isVisible({ timeout: 2000 })) {
        await nextBtn.click();
        await page.waitForLoadState('networkidle', { timeout: 20000 });
        await page.waitForTimeout(1500);
        continue;
      }
    } catch (error) {
      console.log(`[${JURISDICTION}] Error navigating to page ${nextPageNum}:`, error);
      break;
    }
  }
}

async function checkAndClickNextPage(page: Page): Promise<boolean> {
  console.log(`[${JURISDICTION}] Checking for next page...`);

  try {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    const paginationSelectors = [
      'a.aca_pagination_next:not(.aca_pagination_disabled)',
      'a[id*="lnkNext"]:not([disabled])',
      'a:has-text("Next"):not([disabled])',
      'td.aca_pagination_td a.NotSelectedPageButton',
    ];

    for (const selector of paginationSelectors) {
      try {
        const nextButton = page.locator(selector).first();
        if (await nextButton.isVisible({ timeout: 2000 })) {
          console.log(`[${JURISDICTION}] Clicking Next button...`);
          await nextButton.scrollIntoViewIfNeeded();
          await nextButton.click();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(2000);
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  } catch (error) {
    console.log(`[${JURISDICTION}] Error checking pagination:`, error);
    return false;
  }
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

    console.log(`[${JURISDICTION}] AI extracted - Address: "${aiData.address?.substring(0, 40)}...", Score: ${aiData.overallScore}`);

  } catch (error) {
    console.error(`[${JURISDICTION}] Error extracting permit details:`, error);
  }

  return permitData;
}

function transformPermit(raw: PermitData, permitType: string): Omit<Permit, 'id' | 'created_at' | 'updated_at'> | null {
  if (!raw.recordNumber || !raw.aiData) return null;

  const ai = raw.aiData;
  const addressParts = parseAddress(ai.address || '');

  return {
    permit_number: raw.recordNumber,
    description: ai.description || '',
    address: addressParts.street,
    city: addressParts.city || 'Westminster',
    county: 'Carroll County',
    state: 'MD',
    zip_code: addressParts.zip,
    project_type: ai.projectType,
    permit_type: ai.recordType || permitType,
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

async function enterDateRange(page: Page, startDate: Date, endDate: Date): Promise<void> {
  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);
  console.log(`[${JURISDICTION}] Entering date range: ${startDateStr} to ${endDateStr}`);

  // Scroll to see date fields
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(1000);

  // Find date inputs - look for inputs with date-related IDs (Accela standard patterns)
  const startInputSelectors = [
    'input[id*="Start" i][id*="Date" i]',
    'input[id*="From" i][id*="Date" i]',
    'input[id*="Begin" i]',
    'input[id*="txtGSStartDate"]',
    'input[id*="StartDate"]',
  ];

  const endInputSelectors = [
    'input[id*="End" i][id*="Date" i]',
    'input[id*="To" i][id*="Date" i]',
    'input[id*="txtGSEndDate"]',
    'input[id*="EndDate"]',
  ];

  // Try to find and fill start date
  let startFilled = false;
  for (const selector of startInputSelectors) {
    try {
      const startInput = page.locator(selector).first();
      if (await startInput.isVisible({ timeout: 2000 })) {
        await startInput.scrollIntoViewIfNeeded();
        await startInput.click();
        await startInput.clear();
        await startInput.fill(startDateStr);
        console.log(`[${JURISDICTION}] Set start date: ${startDateStr} (using ${selector})`);
        startFilled = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!startFilled) {
    console.log(`[${JURISDICTION}] Could not find start date input, trying generic date fields...`);
    // Try to find any visible date input
    const dateInputs = page.locator('input[type="text"]').filter({ hasText: '' });
    const count = await dateInputs.count();
    for (let i = 0; i < Math.min(count, 10); i++) {
      const input = dateInputs.nth(i);
      try {
        const id = await input.getAttribute('id') || '';
        const placeholder = await input.getAttribute('placeholder') || '';
        if (id.toLowerCase().includes('date') || placeholder.toLowerCase().includes('date') || placeholder.includes('MM/DD/YYYY')) {
          await input.click();
          await input.clear();
          await input.fill(startDateStr);
          console.log(`[${JURISDICTION}] Set start date via generic input: ${startDateStr}`);
          startFilled = true;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  // Try to find and fill end date
  let endFilled = false;
  for (const selector of endInputSelectors) {
    try {
      const endInput = page.locator(selector).first();
      if (await endInput.isVisible({ timeout: 2000 })) {
        await endInput.scrollIntoViewIfNeeded();
        await endInput.click();
        await endInput.clear();
        await endInput.fill(endDateStr);
        console.log(`[${JURISDICTION}] Set end date: ${endDateStr} (using ${selector})`);
        endFilled = true;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!endFilled) {
    console.log(`[${JURISDICTION}] Could not find end date input`);
  }

  await page.waitForTimeout(500);
}

function formatDate(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function parseAddress(address: string): { street: string; city?: string; zip?: string } {
  if (!address) return { street: '' };

  const parts = address.split(',').map(p => p.trim());
  const zipMatch = address.match(/\d{5}(-\d{4})?/);
  const zip = zipMatch ? zipMatch[0].substring(0, 5) : undefined;

  // Common Carroll County cities/areas
  const carrollCountyCities = [
    'Westminster', 'Eldersburg', 'Sykesville', 'Hampstead', 'Taneytown',
    'Mount Airy', 'Manchester', 'New Windsor', 'Union Bridge', 'Finksburg',
    'Woodbine', 'Marriottsville', 'Lineboro', 'Keymar', 'Millers',
    'Gamber', 'Taylorsville', 'Winfield'
  ];

  let city: string | undefined;
  const addressUpper = address.toUpperCase();
  for (const c of carrollCountyCities) {
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
