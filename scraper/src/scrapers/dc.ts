import { Page } from 'playwright';
import { getPage } from '../utils/browser.js';
import { classifyProjectType } from '../utils/ai-scorer.js';
import type { Permit, ScraperResult, Jurisdiction } from '../types/index.js';

const JURISDICTION: Jurisdiction = 'dc';
const BASE_URL = 'https://citizenaccess.dc.gov/dc/Default.aspx';

interface DCPermit {
  'Record ID': string;
  'Record Type': string;
  'Description': string;
  'Address': string;
  'Status': string;
  'Filed Date': string;
  'Applicant'?: string;
  'Project Value'?: string;
}

export async function scrapeDC(): Promise<ScraperResult> {
  console.log(`[${JURISDICTION}] Starting scrape...`);
  const permits: Omit<Permit, 'id' | 'created_at' | 'updated_at'>[] = [];

  let page: Page | null = null;

  try {
    const { page: browserPage, context } = await getPage();
    page = browserPage;

    console.log(`[${JURISDICTION}] Navigating to ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Handle any disclaimer/terms page
    const acceptCheckbox = await page.$('input[type="checkbox"][id*="Disclaimer"], input[id*="chkAgree"]');
    if (acceptCheckbox) {
      await acceptCheckbox.check();
    }

    const acceptButton = await page.$(
      'input[type="submit"][value*="Continue"], a:has-text("Continue"), button:has-text("Continue"), a:has-text("Accept")'
    );
    if (acceptButton) {
      console.log(`[${JURISDICTION}] Accepting terms...`);
      await acceptButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }

    // Navigate to building permits section if needed
    const buildingLink = await page.$('a:has-text("Building"), a[href*="Building"], a:has-text("Permits")');
    if (buildingLink) {
      console.log(`[${JURISDICTION}] Navigating to building permits...`);
      await buildingLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }

    // Set date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // Look for search form and date inputs
    const startDateInput = await page.$('input[id*="txtGSStartDate"], input[id*="StartDate"], input[name*="startDate"]');
    if (startDateInput) {
      await startDateInput.fill(formatDate(startDate));
    }

    const endDateInput = await page.$('input[id*="txtGSEndDate"], input[id*="EndDate"], input[name*="endDate"]');
    if (endDateInput) {
      await endDateInput.fill(formatDate(endDate));
    }

    // Click search
    const searchButton = await page.$(
      'a[id*="btnNewSearch"], input[id*="btnSearch"], button:has-text("Search"), a:has-text("Search")'
    );
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
      const nextLink = await page.$(
        'a[id*="_lnkBtnNext"], a:has-text("Next"), a.aca_pagination_next, a[title="Next"]'
      );
      if (!nextLink) break;

      const isDisabled = await nextLink.getAttribute('disabled');
      const classList = await nextLink.getAttribute('class');
      if (isDisabled || classList?.includes('aspNetDisabled')) break;

      console.log(`[${JURISDICTION}] Going to page ${currentPage + 1}...`);
      await nextLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const pagePermits = await extractPermitsFromPage(page);
      if (pagePermits.length === 0) break;

      rawPermits.push(...pagePermits);
      currentPage++;
    }

    // Transform to standard format
    for (const raw of rawPermits) {
      const permit = transformDCPermit(raw);
      if (permit) {
        permits.push(permit);
      }
    }

    await context.close();

    console.log(`[${JURISDICTION}] Scrape complete. Total permits: ${permits.length}`);

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

async function extractPermitsFromPage(page: Page): Promise<DCPermit[]> {
  const permits: DCPermit[] = [];

  try {
    // Wait for results table
    await page.waitForSelector(
      'table[id*="GridView"], table.ACA_Grid, div[id*="divGlobalSearchResult"], table[id*="gvPermitList"]',
      { timeout: 10000 }
    );

    // Extract data from rows
    const rows = await page.$$(
      'table[id*="GridView"] tbody tr, table.ACA_Grid tbody tr, div[id*="divGlobalSearchResult"] table tr'
    );

    for (const row of rows) {
      const cells = await row.$$('td');
      if (cells.length < 3) continue;

      const cellTexts = await Promise.all(
        cells.map(async (cell) => {
          const text = await cell.textContent();
          return text?.trim() || '';
        })
      );

      // Get record ID from link
      const recordLink = await row.$('a[href*="Cap/CapDetail"], a[id*="lnkPermitNumber"], a[href*="PermitDetail"]');
      let recordId = '';
      if (recordLink) {
        recordId = (await recordLink.textContent())?.trim() || '';
      } else {
        recordId = cellTexts[0];
      }

      // Skip header rows
      if (recordId && !recordId.toLowerCase().includes('record') && !recordId.toLowerCase().includes('permit')) {
        permits.push({
          'Record ID': recordId,
          'Record Type': cellTexts[1] || '',
          'Description': cellTexts[2] || '',
          'Address': cellTexts[3] || '',
          'Status': cellTexts[4] || '',
          'Filed Date': cellTexts[5] || '',
          'Applicant': cellTexts[6] || undefined,
          'Project Value': cellTexts[7] || undefined,
        });
      }
    }
  } catch (error) {
    console.error(`[${JURISDICTION}] Error extracting permits:`, error);
  }

  return permits;
}

function transformDCPermit(raw: DCPermit): Omit<Permit, 'id' | 'created_at' | 'updated_at'> | null {
  if (!raw['Record ID']) return null;

  const description = raw['Description'] || raw['Record Type'] || '';
  const projectType = classifyProjectType(description, raw['Record Type']);
  const addressParts = parseAddress(raw['Address'] || '');

  // Parse project value if available
  let estimatedValue: number | undefined;
  if (raw['Project Value']) {
    const valueMatch = raw['Project Value'].replace(/[$,]/g, '').match(/\d+/);
    if (valueMatch) {
      estimatedValue = parseInt(valueMatch[0], 10);
    }
  }

  return {
    permit_number: raw['Record ID'],
    description,
    address: addressParts.street,
    city: 'Washington',
    county: 'District of Columbia',
    state: 'DC',
    zip_code: addressParts.zip,
    project_type: projectType,
    permit_type: raw['Record Type'],
    status: raw['Status'] || 'Unknown',
    applicant_name: raw['Applicant'],
    estimated_value: estimatedValue,
    submission_date: parseDate(raw['Filed Date']),
    source_url: BASE_URL,
    source_jurisdiction: JURISDICTION,
    raw_data: raw as unknown as Record<string, unknown>,
  };
}

function parseAddress(address: string): { street: string; city?: string; zip?: string } {
  const parts = address.split(',').map((p) => p.trim());

  // DC addresses often end with "Washington, DC XXXXX"
  const zipMatch = address.match(/\b\d{5}\b/);

  if (parts.length >= 1) {
    return {
      street: parts[0],
      city: 'Washington',
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
