import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/**
 * Headless CSV export fallback for State Revenue & Expenditure (payments).
 * Configure selectors after inspecting network/UI:
 *   TEXAS_SPENDING_PAGE_URL
 *   TEXAS_SPENDING_FY_SELECTOR (optional <select> for fiscal year)
 *   TEXAS_SPENDING_DOWNLOAD_TRIGGER_SELECTOR
 */
export async function downloadPaymentsCsvPlaywright(fiscalYear, timeoutMs) {
    const { chromium } = await import('playwright');
    const dir = await mkdtemp(join(tmpdir(), 'tx-pay-'));
    const spendingUrl = process.env.TEXAS_SPENDING_PAGE_URL ?? 'https://comptroller.texas.gov/transparency/spending/';
    const browser = await chromium.launch({
        headless: process.env.TEXAS_PLAYWRIGHT_HEADED === '1' ? false : true,
    });
    try {
        const page = await browser.newPage();
        await page.goto(spendingUrl, { waitUntil: 'load', timeout: timeoutMs });
        const fySel = process.env.TEXAS_SPENDING_FY_SELECTOR;
        if (fySel) {
            await page.locator(fySel).selectOption(String(fiscalYear)).catch(() => { });
        }
        const trigger = process.env.TEXAS_SPENDING_DOWNLOAD_TRIGGER_SELECTOR ??
            'a[href*="csv"], a:has-text("CSV"), button:has-text("CSV")';
        const downloadPromise = page.waitForEvent('download', { timeout: timeoutMs });
        await page.locator(trigger).first().click({ timeout: Math.min(timeoutMs, 60_000) });
        const download = await downloadPromise;
        const path = join(dir, `${fiscalYear}.csv`);
        await download.saveAs(path);
        const csvText = await readFile(path, 'utf8');
        if (csvText.trim().length < 50) {
            throw new Error('Downloaded file too small to be a payments CSV');
        }
        return { csvText, url: spendingUrl, fileName: `payments_${fiscalYear}.csv` };
    }
    finally {
        await browser.close();
    }
}
