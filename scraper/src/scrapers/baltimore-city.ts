import { Page } from 'playwright';
import { getPage } from '../utils/browser.js';
import { classifyProjectType, isRelevantForClipperConstruction } from '../utils/permit-filter.js';
import { captureAndUploadScreenshot } from '../utils/screenshot.js';
import type { Permit, ScraperResult, Jurisdiction } from '../types/index.js';

const JURISDICTION: Jurisdiction = 'baltimore_city_md';
const BASE_URL = 'https://aca-prod.accela.com/BALTIMORE/Cap/CapHome.aspx?module=Building';
const DROPDOWN_LABEL = 'Record Type';
const RECORD_TYPE_TO_SELECT = 'Commercial and Multifamily Combo Permit';

interface PermitData {
  recordNumber: string;
  recordType: string;
  description: string;
  address: string;
  status: string;
  date: string;
  applicantName?: string;
  detailUrl?: string;
  screenshotUrl?: string;
}

export async function scrapeBaltimoreCityMD(): Promise<ScraperResult> {
  console.log(`[${JURISDICTION}] Starting scrape...`);
  const permits: Omit<Permit, 'id' | 'created_at' | 'updated_at'>[] = [];
  let page: Page | null = null;

  try {
    const { page: browserPage, context } = await getPage();
    page = browserPage;

    // Step 1: Navigate to page
    console.log(`[${JURISDICTION}] Navigating to ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Step 1b: Handle disclaimer if present
    await handleDisclaimer(page);

    // Step 2: Find dropdown by label "Record Type" and select "Commercial and Multifamily Combo Permit"
    await selectDropdownByLabel(page, DROPDOWN_LABEL, RECORD_TYPE_TO_SELECT);

    // Step 3: Enter date range (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    await enterDateRange(page, startDate, endDate);

    // Step 4: Click search button
    await clickSearchButton(page);

    // Step 5-7: Loop through results, click each permit, capture details, go back
    const rawPermits = await processPermitResults(page);
    console.log(`[${JURISDICTION}] Found ${rawPermits.length} permits`);

    // Transform and filter permits
    let skippedCount = 0;
    for (const raw of rawPermits) {
      const permit = transformPermit(raw);
      if (permit) {
        if (isRelevantForClipperConstruction(permit.description, permit.permit_type, permit.project_type)) {
          permits.push(permit);
        } else {
          skippedCount++;
        }
      }
    }

    await context.close();
    console.log(`[${JURISDICTION}] Scrape complete. Found: ${permits.length}, Skipped: ${skippedCount}`);

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

async function selectDropdownByLabel(page: Page, labelText: string, optionText: string): Promise<void> {
  console.log(`[${JURISDICTION}] Looking for dropdown with label "${labelText}"...`);

  // Find the label containing the text, then find the associated select
  let dropdown = page.locator(`label:has-text("${labelText}") + select, label:has-text("${labelText}") ~ select`).first();

  if (!await dropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
    dropdown = page.locator(`text="${labelText}" >> .. >> select`).first();
  }

  if (!await dropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
    dropdown = page.locator('select[id*="Type" i], select[name*="Type" i]').first();
  }

  if (!await dropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
    const allSelects = page.locator('select');
    const count = await allSelects.count();

    for (let i = 0; i < count; i++) {
      const select = allSelects.nth(i);
      const options = await select.locator('option').allTextContents();
      const hasOption = options.some(opt =>
        opt.toLowerCase().includes('commercial') || opt.toLowerCase().includes('multifamily')
      );
      if (hasOption) {
        dropdown = select;
        console.log(`[${JURISDICTION}] Found dropdown by scanning options`);
        break;
      }
    }
  }

  // Select the option
  try {
    const options = await dropdown.locator('option').allTextContents();
    console.log(`[${JURISDICTION}] Available options: ${options.slice(0, 10).join(', ')}...`);

    const exactMatch = options.find(opt => opt.trim().toLowerCase() === optionText.toLowerCase());
    const partialMatch = options.find(opt =>
      opt.toLowerCase().includes('commercial') && opt.toLowerCase().includes('multifamily')
    );
    const targetOption = exactMatch || partialMatch;

    if (targetOption) {
      console.log(`[${JURISDICTION}] Selecting: "${targetOption}"`);
      await dropdown.selectOption({ label: targetOption });
      await page.waitForTimeout(1500);
    } else {
      console.log(`[${JURISDICTION}] Warning: Could not find option "${optionText}"`);
    }
  } catch (error) {
    console.log(`[${JURISDICTION}] Error selecting dropdown: ${error}`);
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

  const searchSelectors = [
    'a:has-text("Search")',
    'button:has-text("Search")',
    'input[value*="Search" i]',
    '[id*="btnSearch" i]',
    '[id*="SearchButton" i]',
    'a[id*="Search" i]',
  ];

  for (const selector of searchSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 1500 })) {
        console.log(`[${JURISDICTION}] Found search button with selector: ${selector}`);
        await button.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
        return;
      }
    } catch {
      continue;
    }
  }

  console.log(`[${JURISDICTION}] No search button found, pressing Enter`);
  await page.keyboard.press('Enter');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
}

async function processPermitResults(page: Page): Promise<PermitData[]> {
  const permits: PermitData[] = [];

  // Wait for results table
  try {
    await page.waitForSelector('table tbody tr, .ACA_Grid tr', { timeout: 15000 });
  } catch {
    console.log(`[${JURISDICTION}] No results table found`);
    return permits;
  }

  // Get all permit links from the results
  const permitLinks = await page.$$eval('table tbody tr a, .ACA_Grid tr a', links =>
    links
      .filter(a => a.textContent && a.textContent.trim().match(/^\d+[-\w]+/))
      .map(a => a.textContent!.trim())
  );

  console.log(`[${JURISDICTION}] Found ${permitLinks.length} permit links`);

  // Process each permit
  for (let i = 0; i < permitLinks.length; i++) {
    const permitNumber = permitLinks[i];
    console.log(`[${JURISDICTION}] Processing ${i + 1}/${permitLinks.length}: ${permitNumber}`);

    try {
      // Click into permit detail page
      const link = page.locator(`a:has-text("${permitNumber}")`).first();
      await link.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Extract permit details
      const permitData = await extractPermitDetails(page, permitNumber);

      // Take screenshot
      const screenshotUrl = await captureAndUploadScreenshot(page, permitNumber, JURISDICTION);
      if (screenshotUrl) permitData.screenshotUrl = screenshotUrl;
      permitData.detailUrl = page.url();

      permits.push(permitData);

      // Go back to results
      await page.goBack();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

    } catch (error) {
      console.error(`[${JURISDICTION}] Error processing permit ${permitNumber}:`, error);
      try {
        await page.goBack();
        await page.waitForTimeout(1000);
      } catch { /* ignore */ }
    }
  }

  return permits;
}

async function extractPermitDetails(page: Page, permitNumber: string): Promise<PermitData> {
  const permitData: PermitData = {
    recordNumber: permitNumber,
    recordType: '',
    description: '',
    address: '',
    status: '',
    date: '',
  };

  try {
    const pageText = await page.textContent('body') || '';

    const applicantMatch = pageText.match(/Applicant[:\s]+([^\n]+)/i) ||
                          pageText.match(/Contact[:\s]+([^\n]+)/i);
    if (applicantMatch) permitData.applicantName = applicantMatch[1].trim();

    const descMatch = pageText.match(/Description[:\s]+([^\n]+)/i) ||
                     pageText.match(/Scope[:\s]+([^\n]+)/i) ||
                     pageText.match(/Work Description[:\s]+([^\n]+)/i);
    if (descMatch) permitData.description = descMatch[1].trim();

    const addressMatch = pageText.match(/Address[:\s]+([^\n]+)/i) ||
                        pageText.match(/Location[:\s]+([^\n]+)/i);
    if (addressMatch) permitData.address = addressMatch[1].trim();

    const statusMatch = pageText.match(/Status[:\s]+([^\n]+)/i);
    if (statusMatch) permitData.status = statusMatch[1].trim();

    const typeMatch = pageText.match(/Record Type[:\s]+([^\n]+)/i) ||
                     pageText.match(/Permit Type[:\s]+([^\n]+)/i);
    if (typeMatch) permitData.recordType = typeMatch[1].trim();

    const dateMatch = pageText.match(/Date[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (dateMatch) permitData.date = dateMatch[1];

  } catch (error) {
    console.log(`[${JURISDICTION}] Error extracting details: ${error}`);
  }

  return permitData;
}

function transformPermit(raw: PermitData): Omit<Permit, 'id' | 'created_at' | 'updated_at'> | null {
  if (!raw.recordNumber) return null;

  const description = raw.description || raw.recordType || '';
  const projectType = classifyProjectType(description, raw.recordType);
  const addressParts = parseAddress(raw.address || '');

  return {
    permit_number: raw.recordNumber,
    description,
    address: addressParts.street,
    city: 'Baltimore',
    county: 'Baltimore City',
    state: 'MD',
    zip_code: addressParts.zip,
    project_type: projectType,
    permit_type: raw.recordType || RECORD_TYPE_TO_SELECT,
    status: raw.status || 'Unknown',
    applicant_name: raw.applicantName,
    submission_date: parseDate(raw.date),
    source_url: BASE_URL,
    source_jurisdiction: JURISDICTION,
    screenshot_url: raw.screenshotUrl,
    detail_url: raw.detailUrl,
    raw_data: raw as unknown as Record<string, unknown>,
  };
}

function parseAddress(address: string): { street: string; city?: string; zip?: string } {
  const parts = address.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    const zipMatch = lastPart.match(/\d{5}/);
    return {
      street: parts[0],
      city: parts.length > 2 ? parts[1] : 'Baltimore',
      zip: zipMatch ? zipMatch[0] : undefined,
    };
  }
  return { street: address };
}

function parseDate(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date.toISOString();
  } catch { /* ignore */ }
  return undefined;
}

function formatDate(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}
