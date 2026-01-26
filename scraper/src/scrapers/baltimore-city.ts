import { Page } from 'playwright';
import { getPage } from '../utils/browser.js';
import { classifyProjectType, isRelevantForClipperConstruction } from '../utils/permit-filter.js';
import { captureAndUploadScreenshot, waitForPageReady } from '../utils/screenshot.js';
import type { Permit, ScraperResult, Jurisdiction } from '../types/index.js';

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

    // Handle any disclaimer popup
    try {
      const disclaimerButton = await page.$('input[value="I Accept"], button:has-text("I Accept"), a:has-text("I Accept"), input[id*="btnAccept"]');
      if (disclaimerButton) {
        console.log(`[${JURISDICTION}] Accepting disclaimer...`);
        await disclaimerButton.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
      }
    } catch {
      console.log(`[${JURISDICTION}] No disclaimer found or already accepted`);
    }

    // Look for the record type dropdown
    console.log(`[${JURISDICTION}] Looking for record type dropdown...`);

    const dropdownSelectors = [
      'select[id*="ddlRecordType"]',
      'select[id*="RecordType"]',
      'select[id*="PermitType"]',
      'select[id*="ddlPermitType"]',
      'select[id*="Type"]',
      'select[name*="RecordType"]',
      'select[name*="PermitType"]',
    ];

    let recordTypeDropdown = null;
    for (const selector of dropdownSelectors) {
      recordTypeDropdown = await page.$(selector);
      if (recordTypeDropdown) {
        console.log(`[${JURISDICTION}] Found dropdown with selector: ${selector}`);
        break;
      }
    }

    if (recordTypeDropdown) {
      // Get all options and log them for debugging
      const options = await recordTypeDropdown.$$eval('option', opts =>
        opts.map(o => ({ value: o.value, text: o.textContent?.trim() || '' }))
      );
      console.log(`[${JURISDICTION}] Available record types:`, options.map(o => o.text).slice(0, 10));

      // Find and select the commercial multifamily combo permit option
      const targetOption = options.find(opt =>
        opt.text.toLowerCase().includes('commercial') &&
        opt.text.toLowerCase().includes('multifamily')
      );

      if (targetOption && targetOption.value) {
        console.log(`[${JURISDICTION}] Selecting: ${targetOption.text}`);
        await recordTypeDropdown.selectOption({ value: targetOption.value });
        await page.waitForTimeout(1500);
      } else {
        console.log(`[${JURISDICTION}] Could not find Commercial Multifamily Combo, trying commercial option`);
        const commercialOption = options.find(opt => opt.text.toLowerCase().includes('commercial'));
        if (commercialOption && commercialOption.value) {
          await recordTypeDropdown.selectOption({ value: commercialOption.value });
          await page.waitForTimeout(1500);
        }
      }
    } else {
      console.log(`[${JURISDICTION}] No record type dropdown found, proceeding with date filter only`);
    }

    // Set date range - last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    console.log(`[${JURISDICTION}] Setting date range: ${startDateStr} to ${endDateStr}`);

    // Find date inputs
    const dateInputSelectors = {
      start: [
        'input[id*="txtGSStartDate"]',
        'input[id*="StartDate"]',
        'input[id*="FromDate"]',
        'input[id*="beginDate"]',
      ],
      end: [
        'input[id*="txtGSEndDate"]',
        'input[id*="EndDate"]',
        'input[id*="ToDate"]',
        'input[id*="endDate"]',
      ]
    };

    // Set start date
    for (const selector of dateInputSelectors.start) {
      const startInput = await page.$(selector);
      if (startInput) {
        console.log(`[${JURISDICTION}] Found start date input: ${selector}`);
        await startInput.click();
        await startInput.fill('');
        await startInput.type(startDateStr, { delay: 50 });
        break;
      }
    }

    // Set end date
    for (const selector of dateInputSelectors.end) {
      const endInput = await page.$(selector);
      if (endInput) {
        console.log(`[${JURISDICTION}] Found end date input: ${selector}`);
        await endInput.click();
        await endInput.fill('');
        await endInput.type(endDateStr, { delay: 50 });
        break;
      }
    }

    await page.waitForTimeout(500);

    // Click search button
    const searchSelectors = [
      'a[id*="btnNewSearch"]',
      'input[id*="btnSearch"]',
      'button[id*="btnSearch"]',
      'a[id*="Search"]',
      'input[value="Search"]',
      'button:has-text("Search")',
    ];

    let searchClicked = false;
    for (const selector of searchSelectors) {
      const searchButton = await page.$(selector);
      if (searchButton) {
        console.log(`[${JURISDICTION}] Clicking search button: ${selector}`);
        await searchButton.click();
        searchClicked = true;
        break;
      }
    }

    if (!searchClicked) {
      console.log(`[${JURISDICTION}] No search button found, trying to submit form`);
      await page.keyboard.press('Enter');
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Extract permit data from the results
    const rawPermits = await extractPermitsFromPage(page);
    console.log(`[${JURISDICTION}] Found ${rawPermits.length} permits`);

    // Handle pagination
    let pageNum = 1;
    const maxPages = 5;

    while (pageNum < maxPages && rawPermits.length > 0) {
      const nextButton = await page.$('a[id*="lnkNextPage"], a:has-text("Next"), a[title*="Next"]');
      if (!nextButton) break;

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
    }

    // Process each permit for details and screenshots (limit to first 10)
    const permitsToProcess = rawPermits.slice(0, 10);
    console.log(`[${JURISDICTION}] Processing ${permitsToProcess.length} permits for details...`);

    for (let i = 0; i < permitsToProcess.length; i++) {
      const raw = permitsToProcess[i];
      try {
        console.log(`[${JURISDICTION}] Processing ${i + 1}/${permitsToProcess.length}: ${raw['Record Number']}`);

        const permitLink = await page.$(`a:has-text("${raw['Record Number']}")`);
        if (permitLink) {
          await permitLink.click();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(2000);

          raw['Detail URL'] = page.url();

          const details = await extractPermitDetails(page);
          if (details.applicantName) raw['Applicant Name'] = details.applicantName;
          if (details.description) raw['Description'] = details.description;

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
    await page.waitForSelector('table[id*="GridView"], table[id*="gvPermit"], div[id*="divGlobalSearchResult"]', { timeout: 10000 });

    const rows = await page.$$('table[id*="GridView"] tbody tr, table[id*="gvPermit"] tbody tr, div[id*="divGlobalSearchResult"] table tbody tr');

    for (const row of rows) {
      const cells = await row.$$('td');
      if (cells.length < 3) continue;

      const cellTexts = await Promise.all(
        cells.map(async (cell) => (await cell.textContent())?.trim() || '')
      );

      const recordLink = await row.$('a[href*="Cap"], a[onclick]');
      let recordNumber = recordLink ? (await recordLink.textContent())?.trim() || '' : cellTexts[0];

      if (!recordNumber || recordNumber.toLowerCase().includes('record') || recordNumber.toLowerCase().includes('number')) {
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

async function extractPermitDetails(page: Page): Promise<{ applicantName?: string; description?: string }> {
  const details: { applicantName?: string; description?: string } = {};

  try {
    const applicantElement = await page.$('span[id*="Applicant"], span[id*="ContactName"], td:has-text("Applicant") + td');
    if (applicantElement) {
      details.applicantName = (await applicantElement.textContent())?.trim();
    }

    const descElement = await page.$('span[id*="Description"], span[id*="WorkDesc"], td:has-text("Description") + td, td:has-text("Scope") + td');
    if (descElement) {
      const text = (await descElement.textContent())?.trim();
      if (text && text.length > 5) details.description = text;
    }
  } catch (error) {
    console.error(`[${JURISDICTION}] Error extracting details:`, error);
  }

  return details;
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
