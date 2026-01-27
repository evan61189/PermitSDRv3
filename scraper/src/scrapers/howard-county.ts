import { Page } from 'playwright';
import { getPage } from '../utils/browser.js';
import { classifyProjectType, isRelevantForClipperConstruction } from '../utils/permit-filter.js';
import { captureAndUploadScreenshot } from '../utils/screenshot.js';
import type { Permit, ScraperResult, Jurisdiction } from '../types/index.js';

const JURISDICTION: Jurisdiction = 'howard_county_md';
const BASE_URL = 'https://aca-prod.accela.com/HOWARDCO/Cap/CapHome.aspx?module=Building';
const DROPDOWN_LABEL = 'Permit Type';
const PERMIT_TYPE_TO_SELECT = 'Commercial Alteration Permit';

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

export async function scrapeHowardCounty(): Promise<ScraperResult> {
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

    // Step 2: Find dropdown by label "Permit Type" and select "Commercial Alteration Permit"
    await selectDropdownByLabel(page, DROPDOWN_LABEL, PERMIT_TYPE_TO_SELECT);

    // Step 3: Enter date range (last 3 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 3);
    await enterDateRange(page, startDate, endDate);

    // Step 4: Click search button (bottom left)
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
    // Look for Accept button on disclaimer
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
  console.log(`[${JURISDICTION}] Looking for dropdown with label "${labelText}" under General Search...`);

  // Wait for page to be fully loaded
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // First, log all dropdowns on the page for debugging
  const allDropdowns = await page.$$eval('select', selects =>
    selects.map(s => ({
      id: s.id,
      name: s.name,
      className: s.className,
      optionCount: s.options.length,
      firstOptions: Array.from(s.options).slice(0, 5).map(o => o.text.trim())
    }))
  );
  console.log(`[${JURISDICTION}] Found ${allDropdowns.length} dropdowns on page:`);
  allDropdowns.forEach((d, i) => {
    console.log(`[${JURISDICTION}]   ${i + 1}. id="${d.id}" options: ${d.firstOptions.join(', ')}`);
  });

  let dropdown = null;

  // Method 1: Look for dropdown under "General Search" section
  try {
    // Find the General Search section and look for select within it
    const generalSearchSection = page.locator('text="General Search" >> xpath=ancestor::div[contains(@class,"ACA_Section")] | text="General Search" >> xpath=ancestor::fieldset | text="General Search" >> xpath=ancestor::table').first();
    if (await generalSearchSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`[${JURISDICTION}] Found General Search section`);
      dropdown = generalSearchSection.locator('select').first();
      if (await dropdown.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log(`[${JURISDICTION}] Found dropdown in General Search section`);
      } else {
        dropdown = null;
      }
    }
  } catch {
    console.log(`[${JURISDICTION}] Could not find General Search section`);
  }

  // Method 2: Look for Accela-specific dropdown IDs containing "Type"
  if (!dropdown) {
    const accelaTypeSelectors = [
      'select[id*="ddlPermitType"]',
      'select[id*="PermitType"]',
      'select[id*="RecordType"]',
      'select[id*="ddlRecordType"]',
      'select[id*="Type"][id*="ddl"]',
      'select[id*="ctl00"][id*="Type"]',
      'select[id*="GeneralSearch"]',
    ];

    for (const selector of accelaTypeSelectors) {
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

  // Method 3: Find by label text association
  if (!dropdown) {
    try {
      // Look for the specific label text and find the select near it
      const labelSelectors = [
        `span:has-text("${labelText}") >> xpath=ancestor::tr >> select`,
        `td:has-text("${labelText}") >> xpath=following-sibling::td >> select`,
        `label:has-text("${labelText}") >> xpath=following::select[1]`,
        `text="${labelText}" >> xpath=ancestor::tr >> select`,
      ];

      for (const selector of labelSelectors) {
        try {
          const el = page.locator(selector).first();
          if (await el.isVisible({ timeout: 1000 })) {
            dropdown = el;
            console.log(`[${JURISDICTION}] Found dropdown via label: ${selector}`);
            break;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Continue to next method
    }
  }

  // Method 4: Find any dropdown that contains the target option
  if (!dropdown || !await dropdown.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log(`[${JURISDICTION}] Scanning all dropdowns for option "${optionText}"...`);
    const allSelects = page.locator('select');
    const count = await allSelects.count();

    for (let i = 0; i < count; i++) {
      const select = allSelects.nth(i);
      try {
        const options = await select.locator('option').allTextContents();
        // Check if any option contains keywords from our target
        const keywords = optionText.toLowerCase().split(' ').filter(w => w.length > 3);
        const hasMatch = options.some(opt => {
          const optLower = opt.toLowerCase();
          return keywords.some(kw => optLower.includes(kw));
        });
        if (hasMatch) {
          dropdown = select;
          console.log(`[${JURISDICTION}] Found dropdown by option match at index ${i}`);
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
      console.log(`[${JURISDICTION}] Dropdown options: ${options.slice(0, 15).join(', ')}${options.length > 15 ? '...' : ''}`);

      // Find exact or closest match
      const exactMatch = options.find(opt => opt.trim().toLowerCase() === optionText.toLowerCase());
      const partialMatch = options.find(opt => opt.toLowerCase().includes(optionText.toLowerCase()));
      // Also try matching individual keywords
      const keywords = optionText.toLowerCase().split(' ').filter(w => w.length > 3);
      const keywordMatch = options.find(opt => {
        const optLower = opt.toLowerCase();
        return keywords.every(kw => optLower.includes(kw));
      });

      const targetOption = exactMatch || partialMatch || keywordMatch;

      if (targetOption) {
        console.log(`[${JURISDICTION}] Selecting: "${targetOption}"`);
        await dropdown.selectOption({ label: targetOption });
        await page.waitForTimeout(2000);
      } else {
        console.log(`[${JURISDICTION}] Warning: Could not find option "${optionText}" in available options`);
      }
    } catch (error) {
      console.log(`[${JURISDICTION}] Error selecting dropdown: ${error}`);
    }
  } else {
    console.log(`[${JURISDICTION}] Warning: No dropdown found for "${labelText}"`);
  }
}

async function enterDateRange(page: Page, startDate: Date, endDate: Date): Promise<void> {
  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);
  console.log(`[${JURISDICTION}] Entering date range: ${startDateStr} to ${endDateStr}`);

  // Find date inputs - look for inputs near "Date" labels or with date-related IDs
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
  console.log(`[${JURISDICTION}] Looking for search button (bottom left)...`);

  // Log all buttons/links on the page for debugging
  const allButtons = await page.$$eval('a, button, input[type="submit"], input[type="button"]', elements =>
    elements.map(el => ({
      tag: el.tagName,
      id: el.id,
      text: el.textContent?.trim().substring(0, 30),
      value: (el as HTMLInputElement).value,
      className: el.className
    })).filter(el => el.text || el.value)
  );
  console.log(`[${JURISDICTION}] Found ${allButtons.length} buttons/links on page`);
  const searchButtons = allButtons.filter(b =>
    (b.text?.toLowerCase().includes('search') || b.value?.toLowerCase().includes('search')) &&
    !b.text?.toLowerCase().includes('clear')
  );
  console.log(`[${JURISDICTION}] Search-related buttons:`, searchButtons);

  // Scroll down multiple times to ensure page is fully rendered
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  // Accela-specific selectors for search buttons (typically at bottom left)
  const searchSelectors = [
    // Accela-specific patterns
    'a[id$="_lnkSearch"]',
    'a[id*="btnNewSearch"]',
    'a[id*="lnkSearch"]',
    'a.ACA_LgButton:has-text("Search")',
    'a.ACA_SmButton:has-text("Search")',
    '.ACA_LgButton:has-text("Search")',
    // Generic patterns
    'a:has-text("Search"):not(:has-text("Clear"))',
    'button:has-text("Search")',
    'input[type="submit"][value*="Search" i]',
    'input[type="button"][value*="Search" i]',
    '[id*="btnSearch" i]',
    '[id*="SearchButton" i]',
  ];

  for (const selector of searchSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 2000 })) {
        console.log(`[${JURISDICTION}] Found search button with selector: ${selector}`);
        // Scroll button into view and click
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

  // Try to find and click search button via JavaScript
  console.log(`[${JURISDICTION}] Trying to find search by evaluating page...`);
  const clicked = await page.evaluate(() => {
    // First scroll to make sure everything is visible
    window.scrollTo(0, document.body.scrollHeight);

    const elements = document.querySelectorAll('a, button, input[type="submit"], input[type="button"]');
    for (const el of elements) {
      const text = el.textContent?.toLowerCase().trim() || '';
      const value = (el as HTMLInputElement).value?.toLowerCase() || '';
      const id = el.id?.toLowerCase() || '';

      // Check for search button
      if ((text === 'search' || value === 'search' || id.includes('search') || id.includes('lnksearch')) &&
          !text.includes('clear') && !id.includes('clear')) {
        console.log('Found search element:', el.tagName, el.id, text);
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => (el as HTMLElement).click(), 500);
        return true;
      }
    }
    return false;
  });

  if (clicked) {
    console.log(`[${JURISDICTION}] Clicked search via page evaluation`);
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    return;
  }

  // Fallback: press Enter
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
      // Try to go back if we're stuck on a detail page
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
    // Extract text from common detail page elements
    const pageText = await page.textContent('body') || '';

    // Look for applicant name
    const applicantMatch = pageText.match(/Applicant[:\s]+([^\n]+)/i) ||
                          pageText.match(/Contact[:\s]+([^\n]+)/i);
    if (applicantMatch) permitData.applicantName = applicantMatch[1].trim();

    // Look for description/scope
    const descMatch = pageText.match(/Description[:\s]+([^\n]+)/i) ||
                     pageText.match(/Scope[:\s]+([^\n]+)/i) ||
                     pageText.match(/Work Description[:\s]+([^\n]+)/i);
    if (descMatch) permitData.description = descMatch[1].trim();

    // Look for address
    const addressMatch = pageText.match(/Address[:\s]+([^\n]+)/i) ||
                        pageText.match(/Location[:\s]+([^\n]+)/i);
    if (addressMatch) permitData.address = addressMatch[1].trim();

    // Look for status
    const statusMatch = pageText.match(/Status[:\s]+([^\n]+)/i);
    if (statusMatch) permitData.status = statusMatch[1].trim();

    // Look for record type
    const typeMatch = pageText.match(/Record Type[:\s]+([^\n]+)/i) ||
                     pageText.match(/Permit Type[:\s]+([^\n]+)/i);
    if (typeMatch) permitData.recordType = typeMatch[1].trim();

    // Look for date
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
    city: addressParts.city || 'Columbia',
    county: 'Howard County',
    state: 'MD',
    zip_code: addressParts.zip,
    project_type: projectType,
    permit_type: raw.recordType || PERMIT_TYPE_TO_SELECT,
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
