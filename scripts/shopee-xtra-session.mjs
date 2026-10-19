// Interactive one-time login. Exports ONLY Shopee cookies, never passwords/localStorage.
import { chromium } from 'playwright-core';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseShopeeState } from '../lib/deals/xtra-sync.mjs';
const dir = fileURLToPath(new URL('../.secrets/', import.meta.url));
const file = `${dir}shopee-affiliate-session.json`;
const browser = await chromium.launch({ channel: 'chrome', headless: false });
try {
  const context = await browser.newContext({ locale: 'vi-VN' });
  const page = await context.newPage();
  await page.goto('https://affiliate.shopee.vn/offer/brand_offer', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('LOGIN_REQUIRED: Complete Shopee Affiliate login in the new Chrome window. Waiting up to 15 minutes.');
  await page.locator('a[href*="/offer/brand_offer/"]').first().waitFor({ state: 'visible', timeout: 900000 });
  const cookies = (await context.cookies(['https://shopee.vn','https://affiliate.shopee.vn']))
    .filter(c => /^\.?([a-z0-9-]+\.)*shopee\.vn$/i.test(c.domain) && (c.expires === -1 || c.expires * 1000 > Date.now()));
  const state = parseShopeeState(JSON.stringify({ cookies }));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  await writeFile(file, JSON.stringify(state), { mode: 0o600 });
  await chmod(file, 0o600);
  console.log('SESSION_SAVED: Shopee-only cookies saved locally for approved Vercel configuration. No secret value printed.');
} catch {
  console.error('SESSION_NOT_SAVED: Login was not completed or verified.');
  process.exitCode = 1;
} finally { await browser.close().catch(() => {}); }
