import { chromium } from "npm:playwright-core@1.62.1";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { normalizeXtraProduct } from "../_shared/xtra-normalize.mjs";
import { xtraExpiresAt } from "../_shared/xtra-slots.mjs";

const reply = (body, status = 200) => Response.json(body, { status });
const required = ["XTRA_CRON_SECRET", "BROWSER_CDP_URL", "SHOPEE_STORAGE_STATE", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "XTRA_MARGIN_PERCENT"];

// No cookie/token/URL/body/error dumps. Callers receive bounded status codes only.
Deno.serve(async request => {
  if (request.method !== "POST") return reply({ status: "method_not_allowed" }, 405);
  const secret = Deno.env.get("XTRA_CRON_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return reply({ status: "unauthorized" }, 401);
  if (required.some(key => !Deno.env.get(key))) return reply({ status: "configuration_missing" }, 503);
  const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: lease, error: lockError } = await db.rpc("claim_xtra_import");
  if (lockError) return reply({ status: "database_not_ready" }, 503);
  if (!lease) return reply({ status: "already_running" }, 409);
  let browser;
  let context;
  const deadline = Date.now() + 95000; // Keep under the hosted free-tier wall-clock limit.
  let phase = "browser_connection_failed";
  try {
    const endpoint = new URL(Deno.env.get("BROWSER_CDP_URL"));
    if (endpoint.protocol !== "wss:") throw Error("config");
    const state = JSON.parse(Deno.env.get("SHOPEE_STORAGE_STATE"));
    if (!Array.isArray(state.cookies) || !state.cookies.length || state.cookies.some(c => !/(^|\.)shopee\.vn$/.test(c.domain))) throw Error("config");
    // Local storage may contain unrelated credentials; this collector only needs Shopee cookies.
    const marginPercent = Number(Deno.env.get("XTRA_MARGIN_PERCENT"));
    if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent > 100) throw Error("config");
    browser = await chromium.connectOverCDP(endpoint.href, { timeout: 15000 });
    context = await browser.newContext({ storageState: { cookies: state.cookies, origins: [] }, locale: "vi-VN" });
    context.setDefaultTimeout(6000);
    const page = await context.newPage();
    phase = "login_required_or_page_unavailable";
    await page.goto("https://affiliate.shopee.vn/offer/brand_offer", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.getByText("Hoa hồng (%)", { exact: true }).click();
    await page.locator('a[href*="/offer/brand_offer/"]').first().waitFor();
    // Wait for sorting to finish rather than reading the previous unsorted list.
    await page.waitForLoadState("networkidle", { timeout: 6000 });
    const shops = await page.locator('a[href*="/offer/brand_offer/"]').evaluateAll(links =>
      [...new Set(links.map(link => link.href))].slice(0, 12));
    const deals = new Map();
    phase = "no_verified_products";
    for (const href of shops) {
      if (Date.now() >= deadline) break;
      const url = new URL(href);
      if (url.origin !== "https://affiliate.shopee.vn" || !/^\/offer\/brand_offer\/\d+$/.test(url.pathname)) continue;
      try {
        await page.goto(href, { waitUntil: "domcontentloaded", timeout: 8000 });
        await page.locator(".ItemCard__name").first().waitFor({ timeout: 4000 });
        const rows = await page.locator('a[href*="/offer/product_offer/"]').evaluateAll((links, shopId) => links.map(link => ({
          shop_id: shopId, item_id: new URL(link.href).pathname.split("/").pop(),
          item_name: link.querySelector(".ItemCard__name")?.textContent,
          price: Number(link.querySelector(".price")?.textContent.replaceAll(".", "")),
          commission_rate: Number(link.querySelector(".commRate")?.textContent.match(/[\d,.]+/)?.[0].replace(",", ".")),
          image_url: link.querySelector(".ItemCard__image img")?.src,
          is_xtra: !!link.querySelector('img[src*="label_xtra"]'),
        })), url.pathname.split("/").pop());
        for (const row of rows) {
          const deal = normalizeXtraProduct(row, { marginPercent });
          if (deal) deals.set(deal.id, deal);
        }
      } catch { /* One unavailable shop does not manufacture a replacement. */ }
    }
    if (!deals.size) throw Error("empty");
    phase = "publish_failed";
    const now = Date.now();
    // One atomic RPC swaps the full batch only while this invocation owns the lease.
    const { error } = await db.rpc("publish_xtra_import", {
      token: lease, products: [...deals.values()], checked: new Date(now).toISOString(),
      expiry: new Date(xtraExpiresAt(now)).toISOString(),
    });
    if (error) throw Error("db");
    return reply({ status: "published", count: deals.size, checkedAt: new Date(now).toISOString() });
  } catch {
    return reply({ status: phase }, 502);
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await db.rpc("release_xtra_import", { token: lease });
  }
});
