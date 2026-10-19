import { normalizeXtraProduct } from './xtra-normalize.mjs';
import { inspectShopeeProduct } from './xtra-availability.mjs';

/** Render Affiliate rows, then verify storefront availability; never invent offers. */
export async function collectXtra(context, { marginPercent, deadline, now = Date.now }) {
  const page = await context.newPage();
  const verifyPage = await context.newPage();
  const candidates = new Map();
  const verified = [];
  const missingByShop = new Map();
  const inspected = new Set();
  try {
    page.setDefaultTimeout(6000);
    await page.goto('https://affiliate.shopee.vn/offer/brand_offer', { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.getByText('Hoa hồng (%)', { exact: true }).click();
    await page.waitForLoadState('networkidle', { timeout: 6000 });
    const shops = await page.locator('a[href*="/offer/brand_offer/"]').evaluateAll(links =>
      [...new Set(links.map(link => link.href))].slice(0, 20));
    // Visit more shops when an earlier shop has unavailable products; allow many per shop.
    for (const href of shops) {
      if (now() >= deadline - 16000 || verified.length >= 18) break;
      const url = new URL(href);
      if (url.origin !== 'https://affiliate.shopee.vn' || !/^\/offer\/brand_offer\/[1-9]\d*$/.test(url.pathname)) continue;
      try {
        await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 8000 });
        await page.locator('.ItemCard__name').first().waitFor({ timeout: 4000 });
        const checkedAt = now();
        const rows = await page.locator('a[href*="/offer/product_offer/"]').evaluateAll((links, shopId) => links.map(link => ({
          shop_id: shopId, item_id: new URL(link.href).pathname.split('/').pop(),
          item_name: link.querySelector('.ItemCard__name')?.textContent,
          price: Number(link.querySelector('.price')?.textContent.replaceAll('.', '')),
          commission_rate: Number(link.querySelector('.commRate')?.textContent.match(/[\d,.]+/)?.[0].replace(',', '.')),
          image_url: link.querySelector('.ItemCard__image img')?.src,
          is_xtra: !!link.querySelector('img[src*="label_xtra"]'),
        })), url.pathname.split('/').pop());
        for (const row of rows) {
          const deal = normalizeXtraProduct(row, { marginPercent, now: checkedAt });
          if (deal) candidates.set(deal.id, deal);
        }
      } catch { continue; }
      const ranked = [...candidates.values()].sort((a,b) => b.cashback / b.price - a.cashback / a.price || b.cashback - a.cashback);
      for (const deal of ranked) {
        if (now() >= deadline - 8000 || verified.length >= 18) break;
        if (inspected.has(deal.id)) continue;
        const shop = new URL(deal.productUrl).pathname.split('/')[2];
        if ((missingByShop.get(shop) ?? 0) >= 3) continue;
        inspected.add(deal.id);
        const availability = await inspectShopeeProduct(verifyPage, deal.productUrl);
        if (availability.status === 'missing') missingByShop.set(shop, (missingByShop.get(shop) ?? 0) + 1);
        if (availability.status === 'available') verified.push({ ...deal, availability });
      }
    }
    return verified;
  } finally {
    await page.close().catch(() => {});
    await verifyPage.close().catch(() => {});
  }
}
