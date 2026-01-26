import { Page } from 'playwright';
import { getPage } from '../utils/browser.js';
import { classifyProjectType, isRelevantForClipperConstruction } from '../utils/permit-filter.js';
import type { Permit, ScraperResult, Jurisdiction } from '../types/index.js';

const JURISDICTION: Jurisdiction = 'howard_county_md';
const BASE_URL = 'https://dilp.howardcountymd.gov/CitizenAccess/Cap/CapHome.aspx?module=Building&TabName=Building';

interface HowardCountyPermit {
  'Record Number': string;
  'Record Type': string;
  'Description': string;
  'Address': string;
  'Status': string;
  'Date': string;
  'Applicant Name'?: string;
}

export async function scrapeHowardCounty(): Promise<ScraperResult> {
  console.log(`[${JURISDICTION}] Starting scrape...`);
  const permits: Omit<Permit, 'id' | 'created_at' | 'updated_at'>[] = [];

  let page: Page | null = null;

  try {
    const { page: browserPage, context } = await getPage();
    page = browserPage;

    console.log(`[${JURISDICTION}] Navigating to ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Wait for the page to fully load
    await page.waitForTimeout(3000);

    // Check for and accept any disclaimer/terms
    const disclaimerButton = await page.$('input[id*="Disclaimer"], button:has-text("I Accept"), a:has-text("I Accept")');
    if (disclaimerButton) {
      console.log(`[${JURISDICTION}] Accepting disclaimer...`);
      await disclaimerButton.click();
      await page.waitForLoadState('networkidle');
    }

    // Set date range to last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    // Try to find and fill date inputs
    const startDateInput = await page.$('input[id*="txtGSStartDate"], input[id*="StartDate"]');
    const endDateInput = await page.$('input[id*="txtGSEndDate"], input[id*="EndDate"]');

    if (startDateInput) {
      await startDateInput.fill(formatDate(startDate));
    }
    if (endDateInput) {
      await endDateInput.fill(formatDate(endDate));
    }

    // Click search button
    const searchButton = await page.$('a[id*="btnSearch"], input[id*="btnSearch"], button:has-text("Search")');
    if (searchButton) {
      console.log(`[${JURISDICTION}] Clicking search...`);
      await searchButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
    }

    // Extract permit data from the results table
    const rawPermits = await extractPermitsFromPage(page);
    console.log(`[${JURISDICTION}] Found ${rawPermits.length} permits on page`);

    // Check for pagination and scrape additional pages
    let currentPage = 1;
    const maxPages = 10;

    while (currentPage < maxPages) {
      const nextPageLink = await page.$(`a[href*="Page$${currentPage + 1}"], a:has-text("${currentPage + 1}")`);
      if (!nextPageLink) break;

      console.log(`[${JURISDICTION}] Going to page ${currentPage + 1}...`);
      await nextPageLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const pagePermits = await extractPermitsFromPage(page);
      rawPermits.push(...pagePermits);
      currentPage++;
    }

    // Transform raw data to our permit format and filter for relevance
    let skippedCount = 0;
    for (const raw of rawPermits) {
      const permit = transformHowardCountyPermit(raw);
      if (permit) {
        if (isRelevantForClipperConstruction(permit.description, permit.permit_type, permit.project_type)) {
          permits.push(permit);
        } else {
          skippedCount++;
        }
      }
    }

    await context.close();

    console.log(`[${JURISDICTION}] Scrape complete. Relevant permits: ${permits.length}, Skipped: ${skippedCount}`);

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

async function extractPermitsFromPage(page: Page): Promise<HowardCountyPermit[]> {
  const permits: HowardCountyPermit[] = [];

  try {
    // Wait for table to be visible
    await page.waitForSelector('table[id*="GridView"], table.ACA_Grid, div.ACA_Grid', { timeout: 10000 });

    // Extract data from table rows
    const rows = await page.$$('table[id*="GridView"] tr:not(:first-child), table.ACA_Grid tr:not(:first-child)');

    for (const row of rows) {
      const cells = await row.$$('td');
      if (cells.length < 3) continue;

      const cellTexts = await Promise.all(
        cells.map(async (cell) => {
          const text = await cell.textContent();
          return text?.trim() || '';
        })
      );

      // Try to extract link for record number
      const recordLink = await row.$('a[href*="Cap/CapDetail"]');
      let recordNumber = '';
      if (recordLink) {
        recordNumber = (await recordLink.textContent())?.trim() || '';
      } else if (cellTexts[0]) {
        recordNumber = cellTexts[0];
      }

      if (recordNumber) {
        permits.push({
          'Record Number': recordNumber,
          'Record Type': cellTexts[1] || '',
          'Description': cellTexts[2] || '',
          'Address': cellTexts[3] || '',
          'Status': cellTexts[4] || '',
          'Date': cellTexts[5] || '',
          'Applicant Name': cellTexts[6] || undefined,
        });
      }
    }
  } catch (error) {
    console.error(`[${JURISDICTION}] Error extracting permits:`, error);
  }

  return permits;
}

function transformHowardCountyPermit(
  raw: HowardCountyPermit
): Omit<Permit, 'id' | 'created_at' | 'updated_at'> | null {
  if (!raw['Record Number']) return null;

  const description = raw['Description'] || raw['Record Type'] || '';
  const projectType = classifyProjectType(description, raw['Record Type']);

  // Parse address components
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
    permit_type: raw['Record Type'],
    status: raw['Status'] || 'Unknown',
    applicant_name: raw['Applicant Name'],
    submission_date: parseDate(raw['Date']),
    source_url: BASE_URL,
    source_jurisdiction: JURISDICTION,
    raw_data: raw as unknown as Record<string, unknown>,
  };
}

function parseAddress(address: string): { street: string; city?: string; zip?: string } {
  // Basic address parsing - can be enhanced
  const parts = address.split(',').map((p) => p.trim());

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
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  } catch {
    // Ignore parsing errors
  }

  return undefined;
}

function formatDate(date: Date): string {
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date
    .getDate()
    .toString()
    .padStart(2, '0')}/${date.getFullYear()}`;
}
