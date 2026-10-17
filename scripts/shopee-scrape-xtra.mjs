// Run: npm run shopee:xtra
// Import product-level prices and Xtra badges from the authenticated, rendered Affiliate UI.
// Empty/unknown responses fail without fabricating or overwriting cached offers.

import { inspectShopeeProduct } from "../supabase/functions/_shared/xtra-availability.mjs";
import { normalizeXtraProduct } from "./shopee-xtra-normalize.mjs";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SECRETS_DIR = join(ROOT, ".secrets");
const SESSION_PATH = join(SECRETS_DIR, "shopee-affiliate-session.json");
const DATA_DIR = join(ROOT, "data");
const OUT_FILE = join(DATA_DIR, "shopee-xtra-deals.json");

mkdirSync(SECRETS_DIR, { recursive: true });
mkdirSync(DATA_DIR, { recursive: true });

// Tự động nạp .env.local nếu có
const envPath = join(ROOT, ".env.local");
if (existsSync(envPath)) {
  try {
    const rawEnv = readFileSync(envPath, "utf-8");
    for (const line of rawEnv.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const k = match[1].trim();
        const v = match[2].trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[k]) process.env[k] = v;
      }
    }
  } catch {}
}

console.log("=======================================================");
console.log("🚀 BẮT ĐẦU CÀO HOA HỒNG XTRA SHOPEE QUA PLAYWRIGHT");
console.log("=======================================================");

const hasSession = existsSync(SESSION_PATH);
const isHeadless = process.env.HEADLESS === "true" && hasSession;

console.log(hasSession ? "🔑 Tìm thấy phiên đăng nhập đã lưu." : "👉 Chưa có phiên đăng nhập, sẽ mở trình duyệt để bạn đăng nhập...");

const browser = await chromium.launch({
  headless: isHeadless ? true : false,
});

const context = await browser.newContext({
  storageState: hasSession ? SESSION_PATH : undefined,
  viewport: { width: 1366, height: 900 },
  locale: "vi-VN",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
});

const page = await context.newPage();
const capturedItems = [];
const seenIds = new Set();

// Selectors verified against the rendered Shopee Affiliate Xtra UI.
const settings = existsSync(join(DATA_DIR, "booster-settings.json")) ? JSON.parse(readFileSync(join(DATA_DIR, "booster-settings.json"), "utf8")) : {};

try {
  console.log("\n🌐 Đang điều hướng tới trang Hoa hồng Xtra trên Shopee Affiliate...");
  await page.goto("https://affiliate.shopee.vn/offer/brand_offer", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  // Kiểm tra nếu bị điều hướng về trang đăng nhập
  const currentUrl = page.url();
  if (currentUrl.includes("/login") || currentUrl.includes("/buyer/login")) {
    console.log("\n⚠️  Cần đăng nhập Shopee Affiliate. Hãy đăng nhập tài khoản của bạn trên cửa sổ vừa mở.");
    console.log("   (Script sẽ chờ bạn đăng nhập xong trong tối đa 5 phút)...");
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 300000 });
    await page.waitForTimeout(3000);
    // Lưu phiên đăng nhập mới
    if (process.env.SAVE_SESSION === "true") await context.storageState({ path: SESSION_PATH });
    console.log("✅ Đã đăng nhập; chỉ lưu phiên khi SAVE_SESSION=true.");
    
    // Điều hướng lại vào Hoa hồng Xtra
    await page.goto("https://affiliate.shopee.vn/offer/brand_offer", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  }

  console.log("⏳ Đang tải dữ liệu Hoa hồng Xtra...");
  await page.waitForTimeout(4000);

  // 2. Thử bấm sắp xếp theo "Hoa hồng (%)" nếu nút đó có trên trang
  try {
    const sortBtn = await page.locator("text=Hoa hồng (%)").first();
    if (await sortBtn.isVisible()) {
      await sortBtn.click();
      console.log("👉 Đã bấm sắp xếp theo 'Hoa hồng (%)'");
      await page.waitForTimeout(3000);
    }
  } catch {}

  await page.locator('a[href*="/offer/brand_offer/"]').first().waitFor();
  const shops = await page.locator('a[href*="/offer/brand_offer/"]').evaluateAll(links =>
    [...new Set(links.map(link => link.href))].slice(0, 20));
  const detail = await context.newPage();
  for (const shopUrl of shops) {
    await detail.goto(shopUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await detail.getByText("Sản phẩm của cửa hàng", { exact: true }).waitFor();
    const shopId = new URL(shopUrl).pathname.split("/").pop();
    // Missing product cards fail closed; no shop-level rate is substituted.
    try { await detail.locator('.ItemCard__name').first().waitFor({ timeout: 10000 }); }
    catch { continue; }
    const rows = await detail.locator('a[href*="/offer/product_offer/"]').evaluateAll((links, shopId) => links.map(link => ({
      item_id: new URL(link.href).pathname.split("/").pop(), shop_id: shopId,
      item_name: link.querySelector('.ItemCard__name')?.textContent,
      price: Number(link.querySelector('.price')?.textContent.replaceAll('.', '')),
      commission_rate: Number(link.querySelector('.commRate')?.textContent.match(/[\d,.]+/)?.[0].replace(',', '.')),
      image_url: link.querySelector('.ItemCard__image img')?.src,
      is_xtra: !!link.querySelector('img[src*="label_xtra"]'),
    })), shopId);
    for (const row of rows) {
      const deal = normalizeXtraProduct(row, { marginPercent: settings.safetyMarginPercent ?? 12 });
      if (deal && !seenIds.has(deal.id)) { seenIds.add(deal.id); capturedItems.push(deal); }
    }
  }
  await detail.close();
  if (!capturedItems.length) throw new Error("No verified product-specific Xtra offers captured; existing data not overwritten.");
  const candidates = capturedItems.sort((a, b) => b.cashback / b.price - a.cashback / a.price || b.cashback - a.cashback);
  const verificationPage = await context.newPage();
  const finalDeals = [];
  for (const deal of candidates.slice(0, 60)) {
    const availability = await inspectShopeeProduct(verificationPage, deal.productUrl);
    if (availability.status === "available") finalDeals.push({ ...deal, availability });
    if (finalDeals.length >= 18) break;
  }
  await verificationPage.close();
  if (!finalDeals.length) throw new Error("No purchasable storefront products verified; cache not overwritten.");

  writeFileSync(OUT_FILE, JSON.stringify(finalDeals, null, 2), "utf-8");

  console.log("\n=======================================================");
  console.log(`🎉 HOÀN TẤT! ĐÃ LƯU ${finalDeals.length} SẢN PHẨM HOA HỒNG XTRA VÀO:`);
  console.log(`   ${OUT_FILE}`);
  console.log("=======================================================");
  console.log("\nDanh sách top deal vừa cào được:");
  for (const d of finalDeals.slice(0, 6)) {
    console.log(`  - [${(d.seller).slice(0, 20)}] ${d.name.slice(0, 35)}... | Giá: ${d.price.toLocaleString("vi-VN")}đ | ₫ HOÀN: ${d.cashback.toLocaleString("vi-VN")}đ`);
  }
} catch (err) {
  console.error("❌ Lỗi trong quá trình cào Playwright:", err);
  process.exitCode = 1;
} finally {
  await browser.close();
  console.log("\n👋 Trình duyệt đã đóng.");
}
