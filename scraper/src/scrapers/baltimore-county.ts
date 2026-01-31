import { Page } from 'playwright';
import { getPage } from '../utils/browser.js';
import { extractAndScorePermit, AIExtractedPermit } from '../utils/ai-scorer.js';
import type { Permit, ScraperResult, Jurisdiction } from '../types/index.js';
import type { DateRange } from './index.js';

const JURISDICTION: Jurisdiction = 'baltimore_county_md';
const BASE_URL = 'https://citizenaccess.baltimorecountymd.gov/CitizenAccess/Cap/CapHome.aspx?module=Permits&TabName=Home';
const DROPDOWN_LABEL = 'Record Type';

// Commercial permit types to search for in Baltimore County
const PERMIT_TYPES_TO_SEARCH = [
  'Commercial New Construction',
  'Commercial Alteration',
  'Commercial Addition',
  'Commercial Tenant Fit-Out',
  'Commercial Shell Building',
];

// Default date range is last 3 days
const DEFAULT_DATE_RANGE_DAYS = 3;

interface PermitData {
  recordNumber: string;
  detailUrl?: string;
  pageText: string;
  aiData?: AIExtractedPermit;
}

export async function scrapeBaltimoreCounty(dateRange?: DateRange): Promise<ScraperResult> {
  console.log(`[${JURISDICTION}] Starting scrape...`);
  const permits: Omit<Permit, 'id' | 'created_at' | 'updated_at'>[] = [];
  const seenPermitNumbers = new Set<string>();

  try {
    const { page: browserPage, context } = await getPage();
    const page = browserPage;

    // Loop through each permit type to search
    for (const permitType of PERMIT_TYPES_TO_SEARCH) {
      console.log(`[${JURISDICTION}] ========================================`);
      console.log(`[${JURISDICTION}] Searching for: ${permitType}`);
      console.log(`[${JURISDICTION}] ========================================`);

      try {
        // Step 1: Navigate to page (fresh start for each permit type)
        console.log(`[${JURISDICTION}] Navigating to ${BASE_URL}`);
        await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(2000);

        // Step 1b: Handle disclaimer if present
        await handleDisclaimer(page);

        // Step 2: Find dropdown and select the permit type
        const foundType = await selectDropdownByLabel(page, DROPDOWN_LABEL, permitType);
        if (!foundType) {
          console.log(`[${JURISDICTION}] Permit type "${permitType}" not found in dropdown, skipping...`);
          continue;
        }

        // Step 3: Enter date range
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
        console.log(`[${JURISDICTION}] Searching date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
        await enterDateRange(page, startDate, endDate);

        // Step 4: Click search button
        await clickSearchButton(page);

        // Step 5-7: Loop through results
        const rawPermits = await processPermitResults(page);
        console.log(`[${JURISDICTION}] Found ${rawPermits.length} permits for "${permitType}"`);

        // Use AI to extract and score each permit
        for (const raw of rawPermits) {
          if (seenPermitNumbers.has(raw.recordNumber)) {
            console.log(`[${JURISDICTION}] Skipping duplicate: ${raw.recordNumber}`);
            continue;
          }

          if (raw.aiData) {
            const permit = transformPermit(raw, permitType);
            if (permit) {
              permits.push(permit);
              seenPermitNumbers.add(raw.recordNumber);
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
  console.log(`[${JURISDICTION}] Scrolling to bottom to fully render page...`);

  for (let i = 0; i < 10; i++) {
    await page.evaluate((step) => window.scrollBy(0, step), 500);
    await page.waitForTimeout(300);
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
}

async function selectDropdownByLabel(page: Page, labelText: string, optionText: string): Promise<boolean> {
  console.log(`[${JURISDICTION}] Looking for "${labelText}" dropdown...`);

  await scrollToRenderPage(page);

  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  await page.evaluate((y) => window.scrollTo(0, y), Math.floor(pageHeight * 0.25));
  await page.waitForTimeout(1000);

  let dropdown = null;

  // Method 1: Find by label text
  const labelSelectors = [
    `span:has-text("${labelText}") >> xpath=ancestor::tr >> select`,
    `td:has-text("${labelText}") >> xpath=following-sibling::td >> select`,
    `label:has-text("${labelText}") >> xpath=following::select[1]`,
    `text="${labelText}" >> xpath=ancestor::tr >> select`,
  ];

  for (const selector of labelSelectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 2000 })) {
        dropdown = el;
        console.log(`[${JURISDICTION}] Found dropdown via label selector`);
        break;
      }
    } catch {
      continue;
    }
  }

  // Method 2: Look for Accela-specific dropdown IDs
  if (!dropdown) {
    const accelaSelectors = [
      'select[id*="ddlPermitType"]',
      'select[id*="PermitType"]',
      'select[id*="ddlRecordType"]',
      'select[id*="RecordType"]',
    ];

    for (const selector of accelaSelectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 1000 })) {
          dropdown = el;
          console.log(`[${JURISDICTION}] Found dropdown with Accela selector: ${selector}`);
          break;
        }
      } catch {
        continue;
      }
    }
  }

  // Method 3: Find dropdown containing target option keywords
  if (!dropdown) {
    console.log(`[${JURISDICTION}] Scanning all dropdowns for matching options...`);
    const allSelects = page.locator('select');
    const count = await allSelects.count();
    const keywords = optionText.toLowerCase().split(' ').filter(w => w.length > 3);

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

      const exactMatch = options.find(opt => opt.trim().toLowerCase() === optionText.toLowerCase());
      const keywords = optionText.toLowerCase().split(' ').filter(w => w.length > 3);
      const keywordMatch = options.find(opt => {
        const optLower = opt.toLowerCase();
        return keywords.every(kw => optLower.includes(kw));
      });
      const partialMatch = options.find(opt => opt.toLowerCase().includes(optionText.toLowerCase()));

      const targetOption = exactMatch || keywordMatch || partialMatch;

      if (targetOption) {
        console.log(`[${JURISDICTION}] Selecting: "${targetOption}"`);
        await dropdown.selectOption({ label: targetOption });
        await page.waitForTimeout(2000);
        return true;
      } else {
        console.log(`[${JURISDICTION}] Warning: Could not find option "${optionText}"`);
        console.log(`[${JURISDICTION}] Available options: ${options.slice(0, 10).join(', ')}`);
        return false;
      }
    } catch (error) {
      console.log(`[${JURISDICTION}] Error selecting dropdown: ${error}`);
      return false;
    }
  } else {
    console.log(`[${JURISDICTION}] Warning: No dropdown found for "${labelText}"`);
    return false;
  }
}

async function enterDateRange(page: Page, startDate: Date, endDate: Date): Promise<void> {
  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);
  console.log(`[${JURISDICTION}] Entering date range: ${startDateStr} to ${endDateStr}`);

  const startInput = page.locator('input[id*="Start" i][id*="Date" i], input[id*="From" i][id*="Date" i], input[id*="Begin" i]').first();
  const endInput = page.locator('input[id*="End" i][id*="Date" i], input[id*="To" i][id*="Date" i]').first();

  try {
    if (await startInput.isVisible({ timeout: 2000 })) {
      await startInput.click();
      await startInput.clear();
      await startInput.fill(startDateStr);
      console.log(`[${JURISDICTION}] Set start date: ${startDateStr}`);
    }
  } catch {
    console.log(`[${JURISDICTION}] Could not find start date input`);
  }

  try {
    if (await endInput.isVisible({ timeout: 2000 })) {
      await endInput.click();
      await endInput.clear();
      await endInput.fill(endDateStr);
      console.log(`[${JURISDICTION}] Set end date: ${endDateStr}`);
    }
  } catch {
    console.log(`[${JURISDICTION}] Could not find end date input`);
  }

  await page.waitForTimeout(500);
}

async function clickSearchButton(page: Page): Promise<void> {
  console.log(`[${JURISDICTION}] Looking for search button...`);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);

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

async function processPermitResults(page: Page): Promise<PermitData[]> {
  const permits: PermitData[] = [];
  let currentPage = 1;

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);

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

    // Get permit links - Baltimore County permits often start with different prefixes
    const permitLinks = await page.$$eval('table tbody tr a, .ACA_Grid tr a, [id*="GridView"] a', links =>
      links
        .filter(a => {
          const text = a.textContent?.trim() || '';
          return text.match(/^[A-Z0-9][-A-Z0-9.]+$/i) && text.length > 5;
        })
        .map(a => a.textContent!.trim())
    );

    const uniquePermitLinks = [...new Set(permitLinks)];
    console.log(`[${JURISDICTION}] Found ${uniquePermitLinks.length} permit links on page ${currentPage}`);

    for (let i = 0; i < uniquePermitLinks.length; i++) {
      const permitNumber = uniquePermitLinks[i];
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

        const permitData = await extractPermitDetails(page, permitNumber);
        permitData.detailUrl = page.url();

        permits.push(permitData);

        // Navigate back
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
    const pageText = await page.evaluate(() => document.body.innerText);
    permitData.pageText = pageText;
    console.log(`[${JURISDICTION}] Got page text (${pageText.length} chars) for ${permitNumber}`);

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
    city: addressParts.city || 'Towson',
    county: 'Baltimore County',
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

function parseAddress(address: string): { street: string; city?: string; zip?: string } {
  if (!address) return { street: '' };

  const parts = address.split(',').map(p => p.trim());
  const zipMatch = address.match(/\d{5}(-\d{4})?/);
  const zip = zipMatch ? zipMatch[0].substring(0, 5) : undefined;

  // Common Baltimore County cities/areas
  const baltimoreCountyCities = [
    'Towson', 'Dundalk', 'Catonsville', 'Owings Mills', 'Pikesville',
    'Essex', 'Parkville', 'Reisterstown', 'Perry Hall', 'White Marsh',
    'Cockeysville', 'Hunt Valley', 'Timonium', 'Lutherville', 'Randallstown',
    'Woodlawn', 'Rosedale', 'Middle River', 'Overlea', 'Fullerton',
    'Loch Raven', 'Sparrows Point', 'Edgemere', 'Lansdowne', 'Arbutus',
    'Halethorpe', 'Elkridge', 'Baltimore'
  ];

  let city: string | undefined;
  const addressUpper = address.toUpperCase();
  for (const c of baltimoreCountyCities) {
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
