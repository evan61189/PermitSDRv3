import { Page } from 'playwright';
import { getPage } from '../utils/browser.js';
import { classifyProjectType, isRelevantForClipperConstruction } from '../utils/permit-filter.js';
import type { Permit, ScraperResult, Jurisdiction } from '../types/index.js';

const JURISDICTION: Jurisdiction = 'baltimore_county_md';
const BASE_URL = 'https://citizenaccess.baltimorecountymd.gov/CitizenAccess/Cap/CapHome.aspx?module=Permits&TabName=Permits';

interface BaltimoreCountyPermit {
  'Record Number': string;
  'Record Type': string;
  'Description': string;
  'Address': string;
  'Status': string;
  'Date': string;
  'Applicant'?: string;
}

export async function scrapeBaltimoreCounty(): Promise<ScraperResult> {
  console.log(`[${JURISDICTION}] Starting scrape...`);
  const permits: Omit<Permit, 'id' | 'created_at' | 'updated_at'>[] = [];

  let page: Page | null = null;

  try {
    const { page: browserPage, context } = await getPage();
    page = browserPage;

    console.log(`[${JURISDICTION}] Navigating to ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Check for disclaimer/terms acceptance
    const disclaimerCheckbox = await page.$('input[type="checkbox"][id*="Disclaimer"]');
    if (disclaimerCheckbox) {
      await disclaimerCheckbox.check();
    }

    const acceptButton = await page.$('input[type="submit"][value*="Accept"], a:has-text("I Accept"), button:has-text("Accept")');
    if (acceptButton) {
      console.log(`[${JURISDICTION}] Accepting terms...`);
      await acceptButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }

    // Set date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    // Look for date inputs with various possible IDs
    const dateInputSelectors = [
      'input[id*="txtGSStartDate"]',
      'input[id*="ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate"]',
      'input[name*="StartDate"]',
    ];

    for (const selector of dateInputSelectors) {
      const input = await page.$(selector);
      if (input) {
        await input.fill(formatDate(startDate));
        break;
      }
    }

    const endDateSelectors = [
      'input[id*="txtGSEndDate"]',
      'input[id*="ctl00_PlaceHolderMain_generalSearchForm_txtGSEndDate"]',
      'input[name*="EndDate"]',
    ];

    for (const selector of endDateSelectors) {
      const input = await page.$(selector);
      if (input) {
        await input.fill(formatDate(endDate));
        break;
      }
    }

    // Click search
    const searchButton = await page.$('a[id*="btnNewSearch"], input[id*="btnSearch"], a:has-text("Search")');
    if (searchButton) {
      console.log(`[${JURISDICTION}] Executing search...`);
      await searchButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
    }

    // Extract permits
    const rawPermits = await extractPermitsFromPage(page);
    console.log(`[${JURISDICTION}] Found ${rawPermits.length} permits on page 1`);

    // Handle pagination
    let currentPage = 1;
    const maxPages = 10;

    while (currentPage < maxPages) {
      const nextButton = await page.$('a[id*="Next"], a:has-text("Next"), a.aca_pagination_next');
      if (!nextButton) break;

      const isDisabled = await nextButton.getAttribute('disabled');
      if (isDisabled) break;

      console.log(`[${JURISDICTION}] Going to page ${currentPage + 1}...`);
      await nextButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const pagePermits = await extractPermitsFromPage(page);
      if (pagePermits.length === 0) break;

      rawPermits.push(...pagePermits);
      currentPage++;
    }

    // Transform to our format and filter for relevance
    let skippedCount = 0;
    for (const raw of rawPermits) {
      const permit = transformBaltimoreCountyPermit(raw);
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

async function extractPermitsFromPage(page: Page): Promise<BaltimoreCountyPermit[]> {
  const permits: BaltimoreCountyPermit[] = [];

  try {
    await page.waitForSelector('table[id*="GridView"], table.ACA_Grid, div[id*="divGlobalSearchResult"]', {
      timeout: 10000,
    });

    // Extract from table structure
    const rows = await page.$$('table[id*="GridView"] tbody tr, table.ACA_Grid tbody tr, div[id*="divGlobalSearchResult"] table tr');

    for (const row of rows) {
      const cells = await row.$$('td');
      if (cells.length < 3) continue;

      const cellTexts = await Promise.all(
        cells.map(async (cell) => {
          const text = await cell.textContent();
          return text?.trim() || '';
        })
      );

      // Get record number from link if available
      const recordLink = await row.$('a[href*="Cap/CapDetail"]');
      let recordNumber = '';
      if (recordLink) {
        recordNumber = (await recordLink.textContent())?.trim() || '';
      } else {
        recordNumber = cellTexts[0];
      }

      if (recordNumber && !recordNumber.includes('Record')) {
        permits.push({
          'Record Number': recordNumber,
          'Record Type': cellTexts[1] || '',
          'Description': cellTexts[2] || '',
          'Address': cellTexts[3] || '',
          'Status': cellTexts[4] || '',
          'Date': cellTexts[5] || '',
          'Applicant': cellTexts[6] || undefined,
        });
      }
    }
  } catch (error) {
    console.error(`[${JURISDICTION}] Error extracting permits from page:`, error);
  }

  return permits;
}

function transformBaltimoreCountyPermit(
  raw: BaltimoreCountyPermit
): Omit<Permit, 'id' | 'created_at' | 'updated_at'> | null {
  if (!raw['Record Number']) return null;

  const description = raw['Description'] || raw['Record Type'] || '';
  const projectType = classifyProjectType(description, raw['Record Type']);
  const addressParts = parseAddress(raw['Address'] || '');

  return {
    permit_number: raw['Record Number'],
    description,
    address: addressParts.street,
    city: addressParts.city || 'Towson',
    county: 'Baltimore County',
    state: 'MD',
    zip_code: addressParts.zip,
    project_type: projectType,
    permit_type: raw['Record Type'],
    status: raw['Status'] || 'Unknown',
    applicant_name: raw['Applicant'],
    submission_date: parseDate(raw['Date']),
    source_url: BASE_URL,
    source_jurisdiction: JURISDICTION,
    raw_data: raw as unknown as Record<string, unknown>,
  };
}

function parseAddress(address: string): { street: string; city?: string; zip?: string } {
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
    // Ignore
  }

  return undefined;
}

function formatDate(date: Date): string {
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date
    .getDate()
    .toString()
    .padStart(2, '0')}/${date.getFullYear()}`;
}
