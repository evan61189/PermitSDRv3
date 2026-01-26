import { chromium, Browser, Page, BrowserContext } from 'playwright';

let browser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
      ],
    });
  }
  return browser;
}

export async function getPage(): Promise<{ page: Page; context: BrowserContext }> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // Set default timeout
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(60000);

  return { page, context };
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function waitForTableLoad(page: Page, tableSelector: string, timeout = 30000): Promise<void> {
  await page.waitForSelector(tableSelector, { state: 'visible', timeout });
  // Wait a bit for data to populate
  await page.waitForTimeout(1000);
}

export async function extractTableData(
  page: Page,
  tableSelector: string,
  headerSelector: string,
  rowSelector: string
): Promise<Record<string, string>[]> {
  // Get headers
  const headers = await page.$$eval(headerSelector, (elements) =>
    elements.map((el) => el.textContent?.trim() || '')
  );

  // Get rows
  const rows = await page.$$eval(rowSelector, (rowElements) =>
    rowElements.map((row) => {
      const cells = row.querySelectorAll('td');
      return Array.from(cells).map((cell) => cell.textContent?.trim() || '');
    })
  );

  // Combine into objects
  return rows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (header && row[index] !== undefined) {
        obj[header] = row[index];
      }
    });
    return obj;
  });
}

export async function handleAccelaSearch(
  page: Page,
  searchButtonSelector: string,
  dateRangeStart?: Date,
  dateRangeEnd?: Date
): Promise<void> {
  // Many Accela sites have similar search interfaces
  // This helper handles common patterns

  if (dateRangeStart) {
    const startDateInput = await page.$('input[id*="StartDate"], input[name*="startDate"]');
    if (startDateInput) {
      await startDateInput.fill(formatDate(dateRangeStart));
    }
  }

  if (dateRangeEnd) {
    const endDateInput = await page.$('input[id*="EndDate"], input[name*="endDate"]');
    if (endDateInput) {
      await endDateInput.fill(formatDate(dateRangeEnd));
    }
  }

  // Click search button
  await page.click(searchButtonSelector);

  // Wait for results to load
  await page.waitForLoadState('networkidle');
}

function formatDate(date: Date): string {
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date
    .getDate()
    .toString()
    .padStart(2, '0')}/${date.getFullYear()}`;
}
