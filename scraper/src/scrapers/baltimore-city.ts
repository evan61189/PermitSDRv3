import { Page } from 'playwright';
import { getPage } from '../utils/browser.js';
import { classifyProjectType, isRelevantForClipperConstruction } from '../utils/permit-filter.js';
import { captureAndUploadScreenshot } from '../utils/screenshot.js';
import type { Permit, ScraperResult, Jurisdiction } from '../types/index.js';
import path from 'path';
import fs from 'fs';

const JURISDICTION: Jurisdiction = 'baltimore_city_md';
const BASE_URL = 'https://aca-prod.accela.com/BALTIMORE/Cap/CapHome.aspx?module=Building';
const RECORD_TYPE_TO_SELECT = 'Commercial and Multifamily Combo Permit';

interface BaltimoreCityPermit {
  'Record Number': string;
  'Record Type': string;
  'Project Name': string;
  'Address': string;
  'Status': string;
  'Date': string;
  'Description'?: string;
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

export async function scrapeBaltimoreCityMD(): Promise<ScraperResult> {
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

    // Look for all select dropdowns on the page
    const allSelects = await page.$$eval('select', selects =>
      selects.map(s => ({
        id: s.id,
        name: s.name,
        options: Array.from(s.options).slice(0, 10).map(o => o.text.trim())
      }))
    );
    console.log(`[${JURISDICTION}] Found select dropdowns:`, JSON.stringify(allSelects, null, 2));

    // Find record type dropdown
    let recordTypeSelected = false;
    for (const selectInfo of allSelects) {
      const hasCombo = selectInfo.options.some(opt =>
        opt.toLowerCase().includes('commercial') || opt.toLowerCase().includes('combo') || opt.toLowerCase().includes('multifamily')
      );

      if (hasCombo || selectInfo.id.toLowerCase().includes('type') || selectInfo.id.toLowerCase().includes('record')) {
        console.log(`[${JURISDICTION}] Found potential record type dropdown: ${selectInfo.id}`);
        const dropdown = page.locator(`select#${selectInfo.id}`);

        const options = await dropdown.locator('option').allTextContents();
        console.log(`[${JURISDICTION}] Options:`, options.slice(0, 15));

        // Find commercial and multifamily combo option
        const targetOption = options.find(opt =>
          opt.toLowerCase().includes('commercial') && opt.toLowerCase().includes('multifamily')
        );

        if (targetOption) {
          console.log(`[${JURISDICTION}] Selecting: ${targetOption}`);
          await dropdown.selectOption({ label: targetOption });
          recordTypeSelected = true;
          await page.waitForTimeout(1500);
          break;
        } else {
          // Try just commercial
          const commercialOption = options.find(opt => opt.toLowerCase().includes('commercial'));
          if (commercialOption) {
            console.log(`[${JURISDICTION}] Selecting fallback: ${commercialOption}`);
            await dropdown.selectOption({ label: commercialOption });
            recordTypeSelected = true;
            await page.waitForTimeout(1500);
            break;
          }
        }
      }
    }

    if (!recordTypeSelected) {
      console.log(`[${JURISDICTION}] Could not find record type dropdown, proceeding without filter`);
    }

    // Set date range - last 30 days (wider range to find more results)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    console.log(`[${JURISDICTION}] Setting date range: ${startDateStr} to ${endDateStr}`);

    // Find all input fields
    const allInputs = await page.$$eval('input[type="text"]', inputs =>
      inputs.map(i => ({ id: i.id, name: i.name, placeholder: i.placeholder }))
    );
    console.log(`[${JURISDICTION}] Found text inputs:`, JSON.stringify(allInputs.slice(0, 10), null, 2));

    // Try to find date inputs
    const datePatterns = ['date', 'Date', 'Start', 'End', 'From', 'To', 'Begin'];

    for (const input of allInputs) {
      const inputId = input.id.toLowerCase();
      if (!inputId) continue;

      if (datePatterns.some(p => inputId.includes(p.toLowerCase()))) {
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

    // Find and click search button
    console.log(`[${JURISDICTION}] Looking for search button...`);

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

    if (!searchClicked) {
      console.log(`[${JURISDICTION}] No search button found, pressing Enter`);
      await page.keyboard.press('Enter');
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    await debugScreenshot(page, '04-after-search');

    // Extract permit data
    const rawPermits = await extractPermitsFromPage(page);
    console.log(`[${JURISDICTION}] Found ${rawPermits.length} permits`);

    // Handle pagination
    let pageNum = 1;
    while (pageNum < 5 && rawPermits.length > 0) {
      const nextButton = page.locator('a:has-text("Next"), a[title*="Next"]').first();
      try {
        if (await nextButton.isVisible({ timeout: 2000 })) {
          const isDisabled = await nextButton.getAttribute('class');
          if (isDisabled?.includes('aspNetDisabled') || isDisabled?.includes('disabled')) break;

          console.log(`[${JURISDICTION}] Going to page ${pageNum + 1}...`);
          await nextButton.click();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(2000);

          const pagePermits = await extractPermitsFromPage(page);
          if (pagePermits.length === 0) break;
          rawPermits.push(...pagePermits);
          pageNum++;
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    // Process permits for details and screenshots (limit to first 5)
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

async function extractPermitsFromPage(page: Page): Promise<BaltimoreCityPermit[]> {
  const permits: BaltimoreCityPermit[] = [];

  try {
    try {
      await page.waitForSelector('table, .ACA_Grid, [id*="GridView"], [id*="gv"]', { timeout: 10000 });
    } catch {
      console.log(`[${JURISDICTION}] No results table found`);
      return permits;
    }

    const rows = await page.$$('table tbody tr, table tr, .ACA_Grid tr');
    console.log(`[${JURISDICTION}] Found ${rows.length} table rows`);

    for (const row of rows) {
      const cells = await row.$$('td');
      if (cells.length < 3) continue;

      const cellTexts = await Promise.all(
        cells.map(async (cell) => (await cell.textContent())?.trim() || '')
      );

      const recordLink = await row.$('a');
      let recordNumber = recordLink ? (await recordLink.textContent())?.trim() || '' : cellTexts[0];

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
        'Project Name': cellTexts[2] || '',
        'Address': cellTexts[3] || '',
        'Status': cellTexts[4] || '',
        'Date': cellTexts[5] || '',
        'Description': cellTexts[2] || '',
      });
    }
  } catch (error) {
    console.error(`[${JURISDICTION}] Error extracting permits:`, error);
  }

  return permits;
}

function transformPermit(raw: BaltimoreCityPermit): Omit<Permit, 'id' | 'created_at' | 'updated_at'> | null {
  if (!raw['Record Number']) return null;

  const description = raw['Description'] || raw['Project Name'] || raw['Record Type'] || '';
  const projectType = classifyProjectType(description, raw['Record Type']);
  const addressParts = parseAddress(raw['Address'] || '');

  return {
    permit_number: raw['Record Number'],
    description,
    address: addressParts.street,
    city: 'Baltimore',
    county: 'Baltimore City',
    state: 'MD',
    zip_code: addressParts.zip,
    project_type: projectType,
    permit_type: raw['Record Type'] || RECORD_TYPE_TO_SELECT,
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
