import { Page } from 'playwright';
import { getPage } from '../utils/browser.js';
import { classifyProjectType, isRelevantForClipperConstruction } from '../utils/permit-filter.js';
import { captureAndUploadScreenshot, waitForPageReady } from '../utils/screenshot.js';
import type { Permit, ScraperResult, Jurisdiction } from '../types/index.js';

const JURISDICTION: Jurisdiction = 'baltimore_city_md';
const BASE_URL = 'https://aca-prod.accela.com/BALTIMORE/Cap/CapHome.aspx?module=Building&TabName=Building';
const RECORD_TYPE_TO_SELECT = 'Commercial and Multifamily Combo Permit';

interface BaltimoreCityPermit {
  'Record Number': string;
  'Record Type': string;
  'Project Name': string;
  'Address': string;
  'Status': string;
  'Date': string;
  'Description'?: string;
  'Work Type'?: string;
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
    const disclaimerAccept = await page.$('input[id*="btnDisclaimerAccept"], a:has-text("I Accept"), button:has-text("Accept")');
    if (disclaimerAccept) {
      console.log(`[${JURISDICTION}] Accepting disclaimer...`);
      await disclaimerAccept.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }

    // Select record type from dropdown
    console.log(`[${JURISDICTION}] Looking for record type dropdown...`);
    const recordTypeDropdown = await page.$(
      'select[id*="RecordType"], select[id*="recordType"], select[id*="ddlRecordType"], select[name*="RecordType"], select[id*="Type"]'
    );

    if (recordTypeDropdown) {
      console.log(`[${JURISDICTION}] Found record type dropdown, selecting "${RECORD_TYPE_TO_SELECT}"...`);

      // Get all options to find the right one
      const options = await recordTypeDropdown.$$('option');
      let found = false;

      for (const option of options) {
        const text = await option.textContent();
        if (text && text.toLowerCase().includes('commercial') && text.toLowerCase().includes('multifamily')) {
          const value = await option.getAttribute('value');
          if (value) {
            await recordTypeDropdown.selectOption({ value });
            found = true;
            console.log(`[${JURISDICTION}] Selected record type: ${text}`);
            break;
          }
        }
      }

      if (!found) {
        // Try selecting by label
        try {
          await recordTypeDropdown.selectOption({ label: RECORD_TYPE_TO_SELECT });
          found = true;
        } catch {
          console.log(`[${JURISDICTION}] Could not find exact match, trying partial match...`);
        }
      }

      await page.waitForTimeout(1000);
    } else {
      console.log(`[${JURISDICTION}] No record type dropdown found, proceeding with search...`);
    }

    // Set date range for last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    // Find and fill date fields
    const startDateInput = await page.$('input[id*="txtGSStartDate"], input[id*="StartDate"]');
    if (startDateInput) {
      await startDateInput.fill(formatDate(startDate));
    }

    const endDateInput = await page.$('input[id*="txtGSEndDate"], input[id*="EndDate"]');
    if (endDateInput) {
      await endDateInput.fill(formatDate(endDate));
    }

    // Execute search
    const searchButton = await page.$('a[id*="btnNewSearch"], input[id*="btnSearch"], a:has-text("Search")');
    if (searchButton) {
      console.log(`[${JURISDICTION}] Executing search...`);
      await searchButton.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
    }

    // Extract permits from results
    const rawPermits = await extractPermitsFromPage(page);
    console.log(`[${JURISDICTION}] Found ${rawPermits.length} permits on page 1`);

    // Handle pagination
    let currentPage = 1;
    const maxPages = 10;

    while (currentPage < maxPages) {
      const nextLink = await page.$('a[id*="_lnkBtnNext"], a:has-text("Next >"), a.aca_pagination_PrevNext:has-text("Next")');
      if (!nextLink) break;

      const nextClass = await nextLink.getAttribute('class');
      if (nextClass?.includes('aspNetDisabled') || nextClass?.includes('disabled')) break;

      console.log(`[${JURISDICTION}] Going to page ${currentPage + 1}...`);
      await nextLink.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const pagePermits = await extractPermitsFromPage(page);
      if (pagePermits.length === 0) break;

      rawPermits.push(...pagePermits);
      currentPage++;
    }

    // Now click into each permit to get details and screenshots
    console.log(`[${JURISDICTION}] Processing ${rawPermits.length} permits for details and screenshots...`);

    for (let i = 0; i < rawPermits.length; i++) {
      const raw = rawPermits[i];

      try {
        console.log(`[${JURISDICTION}] Processing permit ${i + 1}/${rawPermits.length}: ${raw['Record Number']}`);

        // Navigate to permit detail page
        const detailUrl = await navigateToPermitDetail(page, raw['Record Number']);
        if (detailUrl) {
          raw['Detail URL'] = detailUrl;

          // Wait for detail page to load
          await waitForPageReady(page);

          // Extract additional details from detail page
          const additionalDetails = await extractPermitDetails(page);
          if (additionalDetails.applicantName) {
            raw['Applicant Name'] = additionalDetails.applicantName;
          }
          if (additionalDetails.description) {
            raw['Description'] = additionalDetails.description || raw['Description'];
          }

          // Take screenshot
          const screenshotUrl = await captureAndUploadScreenshot(page, raw['Record Number'], JURISDICTION);
          if (screenshotUrl) {
            raw['Screenshot URL'] = screenshotUrl;
          }

          // Go back to results
          await page.goBack();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(1000);
        }
      } catch (error) {
        console.error(`[${JURISDICTION}] Error processing permit ${raw['Record Number']}:`, error);
      }
    }

    // Transform to standard format and filter for relevant opportunities
    let skippedCount = 0;
    for (const raw of rawPermits) {
      const permit = transformBaltimoreCityPermit(raw);
      if (permit) {
        // Filter for Clipper Construction relevance
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

async function navigateToPermitDetail(page: Page, recordNumber: string): Promise<string | null> {
  try {
    // Find the link for this permit number
    const permitLink = await page.$(`a:has-text("${recordNumber}")`);

    if (permitLink) {
      // Check if it's a JavaScript link
      const href = await permitLink.getAttribute('href');
      const onclick = await permitLink.getAttribute('onclick');

      if (onclick || (href && href.startsWith('javascript:'))) {
        // It's a JavaScript link, click it
        await permitLink.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        return page.url();
      } else if (href) {
        // Regular link
        await permitLink.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        return page.url();
      }
    }

    return null;
  } catch (error) {
    console.error(`[${JURISDICTION}] Error navigating to permit detail:`, error);
    return null;
  }
}

async function extractPermitDetails(page: Page): Promise<{ applicantName?: string; description?: string }> {
  const details: { applicantName?: string; description?: string } = {};

  try {
    // Look for applicant information
    const applicantSelectors = [
      'span[id*="Applicant"]',
      'td:has-text("Applicant") + td',
      'label:has-text("Applicant") + span',
      'div[id*="applicant"]',
      '.applicant-name',
      'span[id*="lblContactName"]',
    ];

    for (const selector of applicantSelectors) {
      const element = await page.$(selector);
      if (element) {
        const text = await element.textContent();
        if (text && text.trim()) {
          details.applicantName = text.trim();
          break;
        }
      }
    }

    // Look for description/scope of work
    const descriptionSelectors = [
      'span[id*="Description"]',
      'td:has-text("Description") + td',
      'td:has-text("Scope of Work") + td',
      'label:has-text("Work Description") + span',
      'div[id*="workDescription"]',
      'textarea[id*="Description"]',
      'span[id*="lblWorkDescription"]',
    ];

    for (const selector of descriptionSelectors) {
      const element = await page.$(selector);
      if (element) {
        const text = await element.textContent();
        if (text && text.trim() && text.length > 10) {
          details.description = text.trim();
          break;
        }
      }
    }
  } catch (error) {
    console.error(`[${JURISDICTION}] Error extracting permit details:`, error);
  }

  return details;
}

async function extractPermitsFromPage(page: Page): Promise<BaltimoreCityPermit[]> {
  const permits: BaltimoreCityPermit[] = [];

  try {
    await page.waitForSelector(
      'table[id*="GlobalSearchResult"], table.ACA_Grid, div[id*="divGlobalSearchResult"]',
      { timeout: 10000 }
    );

    const rows = await page.$$(
      'table[id*="GlobalSearchResult"] tbody tr, div[id*="divGlobalSearchResult"] table tbody tr'
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

      // Try to get record number from link
      const recordLink = await row.$('a[href*="Cap/CapDetail"], a[id*="lnkPermitNumber"], a[onclick]');
      let recordNumber = '';
      if (recordLink) {
        recordNumber = (await recordLink.textContent())?.trim() || '';
      } else {
        recordNumber = cellTexts[0];
      }

      // Skip header rows
      if (recordNumber && !recordNumber.toLowerCase().includes('record') && !recordNumber.toLowerCase().includes('number')) {
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
    }
  } catch (error) {
    console.error(`[${JURISDICTION}] Error extracting permits:`, error);
  }

  return permits;
}

function transformBaltimoreCityPermit(
  raw: BaltimoreCityPermit
): Omit<Permit, 'id' | 'created_at' | 'updated_at'> | null {
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
    permit_type: raw['Record Type'],
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
  const parts = address.split(',').map((p) => p.trim());

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
