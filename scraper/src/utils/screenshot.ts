import { Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SCREENSHOTS_BUCKET = 'permit-screenshots';

// Local screenshots directory for fallback
const LOCAL_SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');

/**
 * Takes a screenshot of the current page and uploads it to Supabase Storage
 * @param page Playwright Page instance
 * @param permitNumber The permit number (used for filename)
 * @param jurisdiction The jurisdiction code
 * @returns URL to the screenshot or null if failed
 */
export async function captureAndUploadScreenshot(
  page: Page,
  permitNumber: string,
  jurisdiction: string
): Promise<string | null> {
  try {
    // Generate a clean filename
    const timestamp = Date.now();
    const cleanPermitNumber = permitNumber.replace(/[^a-zA-Z0-9-]/g, '_');
    const filename = `${jurisdiction}/${cleanPermitNumber}_${timestamp}.png`;

    // Take screenshot as buffer
    const screenshotBuffer = await page.screenshot({
      fullPage: true,
      type: 'png',
    });

    // Try to upload to Supabase Storage
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

      // Ensure bucket exists (will fail silently if already exists)
      try {
        await supabase.storage.createBucket(SCREENSHOTS_BUCKET, {
          public: true,
          fileSizeLimit: 5 * 1024 * 1024, // 5MB limit
        });
      } catch {
        // Bucket likely already exists
      }

      const { data, error } = await supabase.storage
        .from(SCREENSHOTS_BUCKET)
        .upload(filename, screenshotBuffer, {
          contentType: 'image/png',
          upsert: true,
        });

      if (error) {
        console.error(`[screenshot] Upload error:`, error.message);
        return saveScreenshotLocally(screenshotBuffer, filename);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(SCREENSHOTS_BUCKET)
        .getPublicUrl(filename);

      console.log(`[screenshot] Uploaded: ${urlData.publicUrl}`);
      return urlData.publicUrl;
    }

    // Fallback to local storage
    return saveScreenshotLocally(screenshotBuffer, filename);
  } catch (error) {
    console.error(`[screenshot] Error capturing screenshot:`, error);
    return null;
  }
}

/**
 * Save screenshot locally as fallback
 */
function saveScreenshotLocally(buffer: Buffer, filename: string): string | null {
  try {
    const localPath = path.join(LOCAL_SCREENSHOTS_DIR, filename);
    const dir = path.dirname(localPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(localPath, buffer);
    console.log(`[screenshot] Saved locally: ${localPath}`);

    // Return a relative path that could be served
    return `/screenshots/${filename}`;
  } catch (error) {
    console.error(`[screenshot] Error saving locally:`, error);
    return null;
  }
}

/**
 * Wait for page to be ready for screenshot
 */
export async function waitForPageReady(page: Page, timeout = 5000): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout });
    await page.waitForTimeout(1000); // Additional buffer for dynamic content
  } catch {
    // Continue even if networkidle times out
    await page.waitForTimeout(2000);
  }
}
