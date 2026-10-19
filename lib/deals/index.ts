import { pickFlash } from "./select-flash";
import { unstable_cache } from "next/cache";
import { FLASH_COUNT, HOT_COUNT, REVALIDATE_SECONDS } from "./config";
import { shopeeProvider } from "./providers/shopee";
import { curatedXtraProvider } from "./providers/curated-xtra";
import { accessTradeProvider } from "./providers/accesstrade";
import { lazadaProvider } from "./providers/lazada";
import { shopeeScrapeProvider } from "./providers/shopee-scrape";
import { SEED_FLASH, SEED_HOT } from "./seed";
import type { Deal, DealBundle, DealProvider } from "./types";

/**
 * Priority order.
 *  1. Curated Shopee Hoa hồng Xtra deals — high commission manually or bulk-imported products.
 *  2. Shopee's own affiliate Open API — real product + real commission, when configured.
 *  3. Locally-scraped Shopee data (`scripts/shopee-scrape.mjs`) — real flash sale products.
 *  4. AccessTrade — real product + real commission for Shopee/TikTok Shop.
 *  5. Lazada fallback.
 */
const PROVIDERS: DealProvider[] = [
  curatedXtraProvider,
  shopeeProvider,
  shopeeScrapeProvider,
  accessTradeProvider,
  ...(process.env.ENABLE_LAZADA_FALLBACK === "true" ? [lazadaProvider] : []),
];


/** "Deal hot hôm nay" — highest Deal Score, preferring deals flash is not already showing. */
function pickHot(deals: Deal[], exclude: Deal[]) {
  const taken = new Set(exclude.map((d) => d.id));
  const unused = deals.filter((d) => !taken.has(d.id));

  // A feed thin enough that flash consumed nearly all of it would otherwise
  // leave this section empty — repeating a deal beats showing none.
  const pool = unused.length >= HOT_COUNT ? unused : deals;

  return [...pool]
    .sort((a, b) => b.dealScore - a.dealScore || b.discountPercent - a.discountPercent)
    .slice(0, HOT_COUNT);
}

async function fetchBundle(): Promise<DealBundle> {
  const activeProviders = PROVIDERS.filter((p) => p.isConfigured());

  // Lấy deal song song từ tất cả các provider đã cấu hình (Shopee Scrape, AccessTrade TikTok Shop / Lazada)
  const results = await Promise.allSettled(
    activeProviders.map(async (provider) => {
      const deals = await provider.fetchDeals();
      return { id: provider.id, deals };
    })
  );

  const allDeals: Deal[] = [];
  const seen = new Set<string>();
  let primarySource: DealBundle["source"] = "seed";

  for (const res of results) {
    if (res.status === "fulfilled" && res.value.deals.length > 0) {
      if (primarySource === "seed") primarySource = res.value.id;
      for (const d of res.value.deals) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          allDeals.push(d);
        }
      }
    } else if (res.status === "rejected") {
      console.warn("[deals] a provider failed:", res.reason);
    }
  }

  if (allDeals.length > 0) {
    let flash = pickFlash(allDeals);

    // Đảm bảo Deal chớp nhoáng LUÔN ĐẦY ĐỦ: nếu ít hơn FLASH_COUNT, tự động đệm thêm để hiển thị liên tục
    if (flash.length < FLASH_COUNT) {
      const fallbackFlash = pickFlash(SEED_FLASH);
      const seenIds = new Set(flash.map((d) => d.id));
      for (const d of fallbackFlash) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          flash.push(d);
          if (flash.length >= FLASH_COUNT) break;
        }
      }
    }

    const hot = pickHot(allDeals, flash);

    return {
      flash,
      hot: hot.length ? hot : SEED_HOT,
      source: primarySource,
      fetchedAt: new Date().toISOString(),
    };
  }

  console.warn("[deals] every provider failed — serving seed data");
  return {
    flash: pickFlash(SEED_FLASH),
    hot: SEED_HOT,
    source: "seed",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Cached entry point for the homepage. Revalidates every
 * `REVALIDATE_SECONDS`, so a page view never blocks on the marketplaces.
 */
export const getDeals = unstable_cache(fetchBundle, ["deals-bundle-complete-xtra-v6"], {
  revalidate: REVALIDATE_SECONDS,
  tags: ["deals"],
});

export { getActiveFlashSaleSession } from "./providers/shopee-scrape";
export { getVouchers } from "./vouchers";
export { getDailyShopeeCoupons } from "./coupons-static";
export type { Coupon, CouponCategory } from "./types";
