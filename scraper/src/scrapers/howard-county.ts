import { Page } from 'playwright';
import { getPage } from '../utils/browser.js';
import { classifyProjectType, isRelevantForClipperConstruction } from '../utils/permit-filter.js';
import { captureAndUploadScreenshot } from '../utils/screenshot.js';
import type { Permit, ScraperResult, Jurisdiction } from '../types/index.js';
import path from 'path';
import fs from 'fs';

const JURISDICTION: Jurisdiction = 'howard_county_md';
const BASE_URL = 'https://aca-prod.accela.com/HOWARDCO/Cap/CapHome.aspx?module=Building';
const PERMIT_TYPE_TO_SELECT = 'Commercial Alteration Permit';

interface HowardCountyPermit {
  'Record Number': string;
  'Record Type': string;
  'Description': string;
  'Address': string;
  'Status': string;
  'Date': string;
  'Applicant Name'?: string;
  'Detail URL'?: string;
  'Screenshot URL'?: string;
}

// Debug screenshot helper
async function debugScreenshot(page: Page, name: string): Promise<void> {
  try {
    const debugDir = path.join(process.cwd(), 'debug-screenshots');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    const filePath = path.join(debugDir, `${JURISDICTION}-${name}-${Date.now()}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`[${JURISDICTION}] Debug screenshot saved: ${filePath}`);
  } catch (error) {
    console.log(`[${JURISDICTION}] Could not save debug screenshot: ${error}`);
  }
}

export async function scrapeHowardCounty(): Promise<ScraperResult> {
  console.log(`[${JURISDICTION}] Starting scrape...`);
  const permits: Omit<Permit, 'id' | 'created_at' | 'updated_at'>[] = [];

  let page: Page | null = null;

  try {
    const { page: browserPage, context } = await getPage();
    page = browserPage;

    console.log(`[${JURISDICTION}] Navigating to ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    await debugScreenshot(page, '01-initial-load');

    // Handle any disclaimer popup
    try {
      const disclaimerButton = page.locator('input[value*="Accept"], button:has-text("Accept"), a:has-text("Accept")').first();
      if (await disclaimerButton.isVisible({ timeout: 3000 })) {
        console.log(`[${JURISDICTION}] Accepting disclaimer...`);
        await disclaimerButton.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
    } catch {
      console.log(`[${JURISDICTION}] No disclaimer found`);
    }

    await debugScreenshot(page, '02-after-disclaimer');

    // Look for all select dropdowns on the page and log them
    const allSelects = await page.$$eval('select', selects =>
      selects.map(s => ({
        id: s.id,
        name: s.name,
        options: Array.from(s.options).slice(0, 5).map(o => o.text)
      }))
    );
    console.log(`[${JURISDICTION}] Found select dropdowns:`, JSON.stringify(allSelects, null, 2));

    // Find permit type dropdown
    let permitTypeSelected = false;
    for (const selectInfo of allSelects) {
      // Check if any option contains "commercial" and "alteration"
      const hasCommercialAlteration = selectInfo.options.some(opt =>
        opt.toLowerCase().includes('commercial') || opt.toLowerCase().includes('alteration')
      );

      if (hasCommercialAlteration || selectInfo.id.toLowerCase().includes('type')) {
        console.log(`[${JURISDICTION}] Found potential permit type dropdown: ${selectInfo.id}`);
        const dropdown = page.locator(`select#${selectInfo.id}`);

        // Get all options
        const options = await dropdown.locator('option').allTextContents();
        console.log(`[${JURISDICTION}] Options:`, options.slice(0, 15));

        // Find commercial alteration option
        const targetOption = options.find(opt =>
          opt.toLowerCase().includes('commercial') && opt.toLowerCase().includes('alteration')
        );

        if (targetOption) {
          console.log(`[${JURISDICTION}] Selecting: ${targetOption}`);
          await dropdown.selectOption({ label: targetOption });
          permitTypeSelected = true;
          await page.waitForTimeout(1500);
          break;
        }
      }
    }

    if (!permitTypeSelected) {
      console.log(`[${JURISDICTION}] Could not find permit type dropdown, proceeding without filter`);
    }

    // Set date range - last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    console.log(`[${JURISDICTION}] Setting date range: ${startDateStr} to ${endDateStr}`);

    // Find all input fields and log them
    const allInputs = await page.$$eval('input[type="text"]', inputs =>
      inputs.map(i => ({ id: i.id, name: i.name, placeholder: i.placeholder }))
    );
    console.log(`[${JURISDICTION}] Found text inputs:`, JSON.stringify(allInputs.slice(0, 10), null, 2));

    // Try to find date inputs by common patterns
    const datePatterns = ['date', 'Date', 'Start', 'End', 'From', 'To', 'Begin'];

    for (const input of allInputs) {
      const inputId = input.id.toLowerCase();
      const inputName = (input.name || '').toLowerCase();

      if (datePatterns.some(p => inputId.includes(p.toLowerCase()) || inputName.includes(p.toLowerCase()))) {
        const inputElement = page.locator(`input#${input.id}`);

        if (inputId.includes('start') || inputId.includes('from') || inputId.includes('begin')) {
          console.log(`[${JURISDICTION}] Setting start date in: ${input.id}`);
          await inputElement.click();
          await inputElement.fill(startDateStr);
        } else if (inputId.includes('end') || inputId.includes('to')) {
          console.log(`[${JURISDICTION}] Setting end date in: ${input.id}`);
          await inputElement.click();
          await inputElement.fill(endDateStr);
        }
      }
    }

    await debugScreenshot(page, '03-after-date-entry');

    // Find and click search button - look for any clickable element with "Search" text
    console.log(`[${JURISDICTION}] Looking for search button...`);

    // Get all clickable elements
    const clickableElements = await page.$$eval('a, button, input[type="submit"], input[type="button"]', elements =>
      elements.map(el => ({
        tag: el.tagName,
        id: el.id,
        text: el.textContent?.trim().substring(0, 50),
        value: (el as HTMLInputElement).value,
        className: el.className,
        isVisible: el.offsetParent !== null
      })).filter(el => el.isVisible)
    );

    console.log(`[${JURISDICTION}] Visible clickable elements:`,
      clickableElements.filter(el =>
        el.text?.toLowerCase().includes('search') ||
        el.value?.toLowerCase().includes('search') ||
        el.id?.toLowerCase().includes('search')
      )
    );

    // Try to click search button using various methods
    let searchClicked = false;

    // Method 1: Look for link/button with "Search" text
    const searchButton = page.locator('a:has-text("Search"), button:has-text("Search"), input[value*="Search"]').first();
    try {
      if (await searchButton.isVisible({ timeout: 2000 })) {
        console.log(`[${JURISDICTION}] Found search button, clicking...`);
        await searchButton.click();
        searchClicked = true;
      }
    } catch {
      console.log(`[${JURISDICTION}] Search button not found with text method`);
    }

    // Method 2: Try by ID patterns
    if (!searchClicked) {
      const searchIds = ['btnNewSearch', 'btnSearch', 'SearchButton', 'lnkSearch'];
      for (const id of searchIds) {
        const btn = page.locator(`[id*="${id}"]`).first();
        try {
          if (await btn.isVisible({ timeout: 1000 })) {
            console.log(`[${JURISDICTION}] Found search button by ID: ${id}`);
            await btn.click();
            searchClicked = true;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    // Method 3: Press Enter as fallback
    if (!searchClicked) {
      console.log(`[${JURISDICTION}] No search button found, pressing Enter`);
      await page.keyboard.press('Enter');
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    await debugScreenshot(page, '04-after-search');

    // Check if there are any results
    const pageContent = await page.content();
    const hasResults = pageContent.includes('record') || pageContent.includes('Record') ||
                       pageContent.includes('permit') || pageContent.includes('Permit');
    console.log(`[${JURISDICTION}] Page appears to have results: ${hasResults}`);

    // Extract permit data from the results
    const rawPermits = await extractPermitsFromPage(page);
    console.log(`[${JURISDICTION}] Found ${rawPermits.length} permits`);

    // If no permits found, try an alternative approach - search without permit type filter
    if (rawPermits.length === 0 && permitTypeSelected) {
      console.log(`[${JURISDICTION}] No results with filter, trying without permit type filter...`);
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(3000);

      // Just set dates and search
      // ... (retry logic)
    }

    // Process permits for details and screenshots (limit to first 5 to avoid timeouts)
    const permitsToProcess = rawPermits.slice(0, 5);

    for (let i = 0; i < permitsToProcess.length; i++) {
      const raw = permitsToProcess[i];
      try {
        console.log(`[${JURISDICTION}] Processing ${i + 1}/${permitsToProcess.length}: ${raw['Record Number']}`);

        const permitLink = page.locator(`a:has-text("${raw['Record Number']}")`).first();
        if (await permitLink.isVisible({ timeout: 2000 })) {
          await permitLink.click();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(2000);

          raw['Detail URL'] = page.url();

          // Take screenshot
          const screenshotUrl = await captureAndUploadScreenshot(page, raw['Record Number'], JURISDICTION);
          if (screenshotUrl) raw['Screenshot URL'] = screenshotUrl;

          await page.goBack();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(1000);
        }
      } catch (error) {
        console.error(`[${JURISDICTION}] Error processing permit ${raw['Record Number']}:`, error);
      }
    }

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
    if (page) {
      await debugScreenshot(page, 'error-state');
    }
    return {
      jurisdiction: JURISDICTION,
      permits,
      scraped_at: new Date().toISOString(),
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function extractPermitsFromPage(page: Page): Promise<HowardCountyPermit[]> {
  const permits: HowardCountyPermit[] = [];

  try {
    // Wait for any table or grid to appear
    try {
      await page.waitForSelector('table, .ACA_Grid, [id*="GridView"], [id*="gv"]', { timeout: 10000 });
    } catch {
      console.log(`[${JURISDICTION}] No results table found`);
      return permits;
    }

    // Try to find rows in various table structures
    const rows = await page.$$('table tbody tr, table tr, .ACA_Grid tr');
    console.log(`[${JURISDICTION}] Found ${rows.length} table rows`);

    for (const row of rows) {
      const cells = await row.$$('td');
      if (cells.length < 3) continue;

      const cellTexts = await Promise.all(
        cells.map(async (cell) => (await cell.textContent())?.trim() || '')
      );

      // Get record number from link if available
      const recordLink = await row.$('a');
      let recordNumber = recordLink ? (await recordLink.textContent())?.trim() || '' : cellTexts[0];

      // Skip header rows and empty rows
      if (!recordNumber ||
          recordNumber.toLowerCase().includes('record') ||
          recordNumber.toLowerCase().includes('number') ||
          recordNumber.toLowerCase().includes('type') ||
          recordNumber.length < 3) {
        continue;
      }

      permits.push({
        'Record Number': recordNumber,
        'Record Type': cellTexts[1] || '',
        'Description': cellTexts[2] || '',
        'Address': cellTexts[3] || '',
        'Status': cellTexts[4] || '',
        'Date': cellTexts[5] || '',
      });
    }
  } catch (error) {
    console.error(`[${JURISDICTION}] Error extracting permits:`, error);
  }

  return permits;
}

function transformPermit(raw: HowardCountyPermit): Omit<Permit, 'id' | 'created_at' | 'updated_at'> | null {
  if (!raw['Record Number']) return null;

  const description = raw['Description'] || raw['Record Type'] || '';
  const projectType = classifyProjectType(description, raw['Record Type']);
  const addressParts = parseAddress(raw['Address'] || '');

  return {
    permit_number: raw['Record Number'],
    description,
    address: addressParts.street,
    city: addressParts.city || 'Columbia',
    county: 'Howard County',
    state: 'MD',
    zip_code: addressParts.zip,
    project_type: projectType,
    permit_type: raw['Record Type'] || PERMIT_TYPE_TO_SELECT,
    status: raw['Status'] || 'Unknown',
    applicant_name: raw['Applicant Name'],
    submission_date: parseDate(raw['Date']),
    source_url: BASE_URL,
    source_jurisdiction: JURISDICTION,
    screenshot_url: raw['Screenshot URL'],
    detail_url: raw['Detail URL'],
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
      city: parts.length > 2 ? parts[1] : undefined,
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
