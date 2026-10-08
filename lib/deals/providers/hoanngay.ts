import { isShopeeUrl, extractUrlFromText } from "../affiliate";

export type HoanNgayProduct = {
  name: string;
  price: number;
  originalPrice: number;
  imageUrl: string | null;
  seller?: string;
  isVerifiedPrice: boolean;
  commission?: number;
  cashbackRate?: number;
  cap?: number;
  productLink?: string;
  shopId?: string;
  itemId?: string;
  platform?: string;
  rating?: string;
  source?: "hoanngay" | "longhouse";
};

export type FastShopeeProduct = HoanNgayProduct;

// In-memory cache with 10-minute TTL
const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  data: HoanNgayProduct;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

function getCacheKey(url: string): string {
  try {
    const extracted = extractUrlFromText(url);
    const u = new URL(extracted.startsWith("http") ? extracted : `https://${extracted}`);
    // Extract shopId and itemId if present for canonical caching
    const m1 = u.pathname.match(/\/product\/(\d+)\/(\d+)/i);
    const m2 = u.pathname.match(/-i\.(\d+)\.(\d+)/i);
    if (m1) return `shopee_${m1[1]}_${m1[2]}`;
    if (m2) return `shopee_${m2[1]}_${m2[2]}`;
    return u.origin + u.pathname;
  } catch {
    return url.trim();
  }
}

function getFromCache(key: string): HoanNgayProduct | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setInCache(key: string, data: HoanNgayProduct): void {
  // Prune expired entries if cache gets large
  if (cache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }
  cache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

/**
 * Session management for hoanngay.vn (CSRF token + cookies)
 */
type HoanNgaySession = {
  csrfToken: string;
  cookieHeader: string;
  expiresAt: number;
};

let cachedSession: HoanNgaySession | null = null;
let sessionFetchPromise: Promise<HoanNgaySession | null> | null = null;

async function getHoanNgaySession(forceRefresh = false): Promise<HoanNgaySession | null> {
  const now = Date.now();
  if (!forceRefresh && cachedSession && now < cachedSession.expiresAt) {
    return cachedSession;
  }

  if (sessionFetchPromise) {
    return sessionFetchPromise;
  }

  sessionFetchPromise = (async () => {
    try {
      const res = await fetch("https://hoanngay.vn", {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });

      if (!res.ok) return null;

      const setCookieHeaders = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie
        ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
        : [res.headers.get("set-cookie")].filter(Boolean);

      const cookieHeader = (setCookieHeaders as string[])
        .map((c: string) => c.split(";")[0].trim())
        .filter(Boolean)
        .join("; ");

      const html = await res.text();
      const match = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i);
      const csrfToken = match ? match[1].trim() : "";

      if (!csrfToken || !cookieHeader) return null;

      const session: HoanNgaySession = {
        csrfToken,
        cookieHeader,
        expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour session TTL
      };
      cachedSession = session;
      return session;
    } catch {
      return null;
    } finally {
      sessionFetchPromise = null;
    }
  })();

  return sessionFetchPromise;
}

/**
 * Expand shortlink (s.shopee.vn, vn.shp.ee) if needed
 */
async function expandShopeeShortLink(url: string): Promise<string> {
  const lower = url.toLowerCase();
  const isShort =
    lower.includes("s.shopee.vn") ||
    lower.includes("vn.shp.ee") ||
    lower.includes("shp.ee") ||
    lower.includes("shope.ee");

  if (!isShort) {
    return url;
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(2500),
    });
    return res.url || url;
  } catch {
    return url;
  }
}

type HoanNgayRawData = {
  platform?: string;
  platform_name?: string;
  product_name?: string;
  image?: string;
  price?: number;
  cashback_rate?: number;
  cashback_amount?: number;
  shop_id?: string | number;
  shop_name?: string;
  item_id?: string | number;
  product_url?: string;
  rating?: string;
};

type LonghouseRawProduct = {
  itemId?: string | number;
  shopId?: string | number;
  productName?: string;
  shopName?: string;
  price?: number;
  imageUrl?: string;
  productLink?: string;
  commission?: number;
  shopeeComFinal?: number;
  cap?: number;
  shopeeRatePercent?: number;
  totalRatePercent?: number;
};

/**
 * Primary HoanNgay API request
 */
async function queryHoanNgay(
  cleanLink: string,
  session: HoanNgaySession
): Promise<{ success: boolean; data?: HoanNgayRawData; needsRefresh?: boolean }> {
  try {
    const res = await fetch("https://hoanngay.vn/api/product/parse", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-CSRF-TOKEN": session.csrfToken,
        "Cookie": session.cookieHeader,
        "Origin": "https://hoanngay.vn",
        "Referer": "https://hoanngay.vn/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
      body: JSON.stringify({ url: cleanLink }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });

    if (res.status === 419) {
      return { success: false, needsRefresh: true };
    }

    if (!res.ok) {
      return { success: false };
    }

    const body = (await res.json()) as { message?: string; success?: boolean; data?: HoanNgayRawData };
    if (body?.message === "Yêu cầu không hợp lệ.") {
      return { success: false, needsRefresh: true };
    }

    if (body?.success && body?.data) {
      return { success: true, data: body.data };
    }

    return { success: false };
  } catch {
    return { success: false };
  }
}

/**
 * Secondary fallback to Longhouse if HoanNgay fails
 */
async function queryLonghouseFallback(cleanLink: string): Promise<LonghouseRawProduct | null> {
  try {
    const res = await fetch("https://api.longhousee.com/api/v1/shopee/product-commission", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "https://longhousee.com",
        "referer": "https://longhousee.com/",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ link: cleanLink }),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { status?: string; productInfo?: LonghouseRawProduct };
    if (body?.status === "success" && body?.productInfo) {
      return body.productInfo;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves verified real-time Shopee product, cashback %, price, title, shop name, and CDN image from hoanngay.vn.
 * Falls back safely to Longhouse if hoanngay.vn is unreachable.
 * Uses 10-minute in-memory cache to minimize external queries.
 */
export async function lookupHoanNgayProduct(
  rawUrl: string,
  discountPercentHint?: number | null,
): Promise<HoanNgayProduct | null> {
  const rawCleanLink = extractUrlFromText(rawUrl);
  if (!isShopeeUrl(rawCleanLink)) {
    return null;
  }

  const cleanLink = await expandShopeeShortLink(rawCleanLink);

  const cacheKey = getCacheKey(cleanLink);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. Try HoanNgay first
  let session = await getHoanNgaySession();
  let hoanNgayData: HoanNgayRawData | null = null;

  if (session) {
    let q = await queryHoanNgay(cleanLink, session);
    if (q.needsRefresh) {
      cachedSession = null;
      session = await getHoanNgaySession(true);
      if (session) {
        q = await queryHoanNgay(cleanLink, session);
      }
    }
    if (q.success && q.data) {
      hoanNgayData = q.data;
    }
  }

  if (hoanNgayData) {
    const price = Number(hoanNgayData.price);
    if (Number.isFinite(price) && price > 0) {
      const cashbackRate = Number(hoanNgayData.cashback_rate);
      const rawCashback = Number(hoanNgayData.cashback_amount);
      const commission =
        Number.isFinite(rawCashback) && rawCashback > 0
          ? rawCashback
          : Number.isFinite(cashbackRate) && cashbackRate > 0
            ? Math.round(price * (cashbackRate / 100))
            : undefined;

      let originalPrice = price;
      if (discountPercentHint && discountPercentHint > 0 && discountPercentHint < 90) {
        originalPrice = Math.round((price / (1 - discountPercentHint / 100)) / 1000) * 1000;
      } else {
        originalPrice = Math.round((price * 1.35) / 1000) * 1000;
      }

      const productLink = hoanNgayData.product_url ? String(hoanNgayData.product_url).trim() : undefined;
      const shopId = hoanNgayData.shop_id ? String(hoanNgayData.shop_id).trim() : undefined;
      const itemId = hoanNgayData.item_id ? String(hoanNgayData.item_id).trim() : undefined;

      const result: HoanNgayProduct = {
        name: String(hoanNgayData.product_name || "").trim(),
        price,
        originalPrice: originalPrice > price ? originalPrice : price,
        imageUrl: hoanNgayData.image ? String(hoanNgayData.image).trim() : null,
        seller: hoanNgayData.shop_name ? String(hoanNgayData.shop_name).trim() : undefined,
        isVerifiedPrice: true,
        commission,
        cashbackRate: Number.isFinite(cashbackRate) && cashbackRate > 0 ? cashbackRate : undefined,
        productLink,
        shopId,
        itemId,
        rating: hoanNgayData.rating ? String(hoanNgayData.rating) : undefined,
        platform: hoanNgayData.platform_name || "Shopee",
        source: "hoanngay",
      };

      setInCache(cacheKey, result);
      if (shopId && itemId) {
        setInCache(`shopee_${shopId}_${itemId}`, result);
      }
      return result;
    }
  }

  // 2. Secondary fallback to Longhouse if HoanNgay was unreachable or had an error
  const lhInfo = await queryLonghouseFallback(cleanLink);
  if (lhInfo) {
    const price = Number(lhInfo.price);
    if (Number.isFinite(price) && price > 0) {
      const rawCommission = Number(lhInfo.commission ?? lhInfo.shopeeComFinal);
      const rawCap = Number(lhInfo.cap);
      const commission = Number.isFinite(rawCommission) && rawCommission > 0 ? rawCommission : undefined;
      const cap = Number.isFinite(rawCap) && rawCap > 0 ? rawCap : undefined;
      const ratePercent = Number(lhInfo.shopeeRatePercent ?? lhInfo.totalRatePercent);

      let originalPrice = price;
      if (discountPercentHint && discountPercentHint > 0 && discountPercentHint < 90) {
        originalPrice = Math.round((price / (1 - discountPercentHint / 100)) / 1000) * 1000;
      } else {
        originalPrice = Math.round((price * 1.35) / 1000) * 1000;
      }

      const productLink = lhInfo.productLink ? String(lhInfo.productLink).trim() : undefined;
      const rawItemId = lhInfo.itemId ? String(lhInfo.itemId).trim() : undefined;
      let shopId: string | undefined = undefined;
      let itemId: string | undefined = rawItemId;

      if (productLink) {
        const match1 = productLink.match(/\/product\/(\d+)\/(\d+)/i);
        const match2 = productLink.match(/-i\.(\d+)\.(\d+)/i);
        const m = match1 || match2;
        if (m) {
          shopId = m[1];
          itemId = m[2];
        }
      }

      const result: HoanNgayProduct = {
        name: String(lhInfo.productName || "").trim(),
        price,
        originalPrice: originalPrice > price ? originalPrice : price,
        imageUrl: lhInfo.imageUrl ? String(lhInfo.imageUrl).trim() : null,
        seller: lhInfo.shopName ? String(lhInfo.shopName).trim() : undefined,
        isVerifiedPrice: true,
        commission,
        cashbackRate: Number.isFinite(ratePercent) && ratePercent > 0 ? ratePercent : undefined,
        cap,
        productLink,
        shopId,
        itemId,
        source: "longhouse",
      };

      setInCache(cacheKey, result);
      if (shopId && itemId) {
        setInCache(`shopee_${shopId}_${itemId}`, result);
      }
      return result;
    }
  }

  return null;
}

export const lookupFastShopeeProduct = lookupHoanNgayProduct;
