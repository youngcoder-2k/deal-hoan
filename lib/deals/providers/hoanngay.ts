import { isShopeeUrl, isTikTokUrl, cleanTikTokUrl, extractUrlFromText } from "../affiliate";

export type HoanNgayProduct = {
  name: string;
  price: number;
  originalPrice: number;
  imageUrl: string | null;
  seller?: string;
  isVerifiedPrice: boolean;
  commission?: number;
  sellerCommission?: number;
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

function isSupportedTikTokUrl(url: string): boolean {
  if (!isTikTokUrl(url)) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      (parsed.hostname === "tiktok.com" || parsed.hostname.endsWith(".tiktok.com"));
  } catch {
    return false;
  }
}

function cleanHoanNgayTikTokLink(url: string): string {
  const parsed = new URL(cleanTikTokUrl(url));
  if (/\/(?:pdp|view\/product)\/\d+\/?$/i.test(parsed.pathname)) {
    // Product identity is in the path: remove personal share/tracking payloads.
    for (const key of [...parsed.searchParams.keys()]) {
      if (!["region", "locale", "local"].includes(key)) parsed.searchParams.delete(key);
    }
    parsed.hash = "";
  }
  return parsed.toString();
}

function getCacheKey(url: string): string {
  try {
    const extracted = extractUrlFromText(url);
    const u = new URL(extracted.startsWith("http") ? extracted : `https://${extracted}`);
    // TikTok may identify the product in query params, not just the path.
    if (isSupportedTikTokUrl(u.href)) {
      u.hash = "";
      u.searchParams.sort();
      return `tiktok_${u.href}`;
    }
    // Extract Shopee shopId and itemId if present for canonical caching
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
 * Expand shortlink (s.shopee.vn, vn.shp.ee) if needed and normalize to canonical product URL.
 */
async function expandShopeeShortLink(url: string): Promise<string> {
  // If URL already embeds origin_link, unwrap directly with 0ms overhead
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (u.searchParams.has("origin_link")) {
      const orig = u.searchParams.get("origin_link");
      if (orig) return expandShopeeShortLink(decodeURIComponent(orig));
    }
    const mOpa = u.pathname.match(/\/(?:opaanlp|product)\/(\d+)\/(\d+)/i);
    const mProd = u.pathname.match(/-i\.(\d+)\.(\d+)/i);
    const m = mOpa || mProd;
    if (m) {
      return `https://shopee.vn/product/${m[1]}/${m[2]}`;
    }
  } catch {}

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
      signal: AbortSignal.timeout(3000),
    });
    const finalUrl = res.url || url;
    try {
      const u2 = new URL(finalUrl);
      const m1 = u2.pathname.match(/\/(?:opaanlp|product)\/(\d+)\/(\d+)/i);
      const m2 = u2.pathname.match(/-i\.(\d+)\.(\d+)/i);
      const m = m1 || m2;
      if (m) {
        return `https://shopee.vn/product/${m[1]}/${m[2]}`;
      }
    } catch {}
    return finalUrl;
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
  sellerComFinal?: number;
  shopeeComFinal?: number;
  cap?: number;
  capRaw?: number;
  isCapped?: boolean;
  isLimitCap?: boolean;
  shopeeRatePercent?: number;
  totalRatePercent?: number;
};

/**
 * Tỷ lệ hoa hồng cơ bản Shopee (Shopee Base Commission Rate) theo ngành hàng chính thức.
 * Tổng hoa hồng Shopee chi trả = Hoa hồng người bán (Xtra) + Hoa hồng cơ bản sàn Shopee (Uncapped).
 */
export function getShopeeCategoryRate(text: string): number {
  if (!text) return 0.0368;
  const s = text.toLowerCase();

  // 1. Phụ kiện thời trang, Trang sức, Vàng bạc, Đồng hồ, Thời trang & Sắc đẹp: ~6.09%
  if (
    s.includes("trang sức") ||
    s.includes("vàng") ||
    s.includes("bạc") ||
    s.includes("nhẫn") ||
    s.includes("dây chuyền") ||
    s.includes("bông tai") ||
    s.includes("khuyên tai") ||
    s.includes("lắc tay") ||
    s.includes("hoa tai") ||
    s.includes("kim hoàn") ||
    s.includes("phụ kiện & trang sức") ||
    s.includes("phụ kiện thời trang") ||
    s.includes("thời trang nữ") ||
    s.includes("thời trang nam") ||
    s.includes("sắc đẹp") ||
    s.includes("mỹ phẩm") ||
    s.includes("son ") ||
    s.includes("son môi") ||
    s.includes("đồng hồ") ||
    s.includes("giày dép") ||
    s.includes("túi ví") ||
    s.includes("quần áo") ||
    s.includes("váy") ||
    s.includes("đầm")
  ) {
    return 0.0609075;
  }

  // 2. Nhà cửa & Đời sống, Nội thất, Trang trí nhà cửa, Đồ gia dụng: ~3.565%
  if (
    s.includes("nhà cửa") ||
    s.includes("đời sống") ||
    s.includes("nội thất") ||
    s.includes("trang trí") ||
    s.includes("gương") ||
    s.includes("bàn") ||
    s.includes("ghế") ||
    s.includes("tủ") ||
    s.includes("kệ") ||
    s.includes("giường") ||
    s.includes("pegboard") ||
    s.includes("đèn") ||
    s.includes("rèm") ||
    s.includes("gối") ||
    s.includes("nệm") ||
    s.includes("chăn") ||
    s.includes("decor") ||
    s.includes("wood decor")
  ) {
    return 0.0356538;
  }

  // 3. Điện thoại & Phụ kiện công nghệ
  if (
    s.includes("ốp lưng") ||
    s.includes("cường lực") ||
    s.includes("cáp sạc") ||
    s.includes("củ sạc") ||
    s.includes("phụ kiện điện thoại")
  ) {
    return 0.0350;
  }
  if (
    s.includes("điện thoại") ||
    s.includes("smartphone") ||
    s.includes("iphone") ||
    s.includes("samsung")
  ) {
    return 0.0158;
  }

  // 4. Máy tính, Laptop, Thiết bị điện tử
  if (
    s.includes("máy tính") ||
    s.includes("laptop") ||
    s.includes("linh kiện") ||
    s.includes("thiết bị điện tử") ||
    s.includes("máy quay") ||
    s.includes("máy ảnh")
  ) {
    return 0.0158;
  }

  // 5. Điện gia dụng
  if (
    s.includes("thiết bị điện gia dụng") ||
    s.includes("nồi cơm") ||
    s.includes("máy hút bụi") ||
    s.includes("quạt") ||
    s.includes("máy sấy")
  ) {
    return 0.0250;
  }

  // 6. Sức khỏe
  if (
    s.includes("sức khỏe") ||
    s.includes("thực phẩm chức năng") ||
    s.includes("y tế")
  ) {
    return 0.0500;
  }

  // 7. Thể thao & Dã ngoại
  if (
    s.includes("thể thao") ||
    s.includes("dã ngoại") ||
    s.includes("du lịch")
  ) {
    return 0.0450;
  }

  // 8. Nhà sách & Văn phòng phẩm
  if (
    s.includes("nhà sách") ||
    s.includes("sách") ||
    s.includes("văn phòng phẩm")
  ) {
    return 0.0400;
  }

  // 9. Thú cưng
  if (
    s.includes("thú cưng") ||
    s.includes("mèo") ||
    s.includes("chó")
  ) {
    return 0.0400;
  }

  // 10. Mẹ & Bé, Bách hóa
  if (
    s.includes("mẹ & bé") ||
    s.includes("bách hóa") ||
    s.includes("thực phẩm") ||
    s.includes("đồ ăn")
  ) {
    return 0.0220;
  }

  // Mặc định đơn hàng trực tiếp Shopee
  return 0.0368;
}

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
 * Resolves real-time Shopee/TikTok product data and cashback from HoanNgay.
 * Only Shopee uses the Longhouse fallback; TikTok returns null on provider failure.
 * Uses 10-minute in-memory cache to minimize external queries.
 */
export async function lookupHoanNgayProduct(
  rawUrl: string,
  discountPercentHint?: number | null,
): Promise<HoanNgayProduct | null> {
  const rawCleanLink = extractUrlFromText(rawUrl);
  const isShopee = isShopeeUrl(rawCleanLink);
  const isTikTok = isSupportedTikTokUrl(rawCleanLink);
  if (!isShopee && !isTikTok) return null;

  // Preserve short-link/product-selector queries; strip personal params from direct PDP URLs.
  const cleanLink = isShopee
    ? await expandShopeeShortLink(rawCleanLink)
    : cleanHoanNgayTikTokLink(rawCleanLink);

  const cacheKey = getCacheKey(cleanLink);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const runHoanNgay = async (): Promise<HoanNgayProduct | null> => {
    try {
      let session = await getHoanNgaySession();
      if (!session) return null;
      let q = await queryHoanNgay(cleanLink, session);
      if (q.needsRefresh) {
        cachedSession = null;
        session = await getHoanNgaySession(true);
        if (session) q = await queryHoanNgay(cleanLink, session);
      }
      if (!q.success || !q.data) return null;
      const hoanNgayData = q.data;
      const upstreamPlatform = hoanNgayData.platform || hoanNgayData.platform_name;
      if (isTikTok && upstreamPlatform && !upstreamPlatform.toLowerCase().includes("tiktok")) return null;
      const price = Number(hoanNgayData.price);
      const hasProductDetails = Boolean(String(hoanNgayData.product_name || "").trim());
      if (!Number.isFinite(price) || (price <= 0 && (!isTikTok || !hasProductDetails))) return null;

      const cashbackRate = Number(hoanNgayData.cashback_rate);
      const rawCashback = Number(hoanNgayData.cashback_amount);
      const commission =
        Number.isFinite(rawCashback) && rawCashback >= 0
          ? rawCashback
          : Number.isFinite(cashbackRate) && cashbackRate >= 0
            ? Math.round(price * (cashbackRate / 100))
            : undefined;

      let originalPrice = price;
      if (isShopee && discountPercentHint && discountPercentHint > 0 && discountPercentHint < 90) {
        originalPrice = Math.round((price / (1 - discountPercentHint / 100)) / 1000) * 1000;
      } else if (isShopee) {
        originalPrice = Math.round((price * 1.35) / 1000) * 1000;
      }

      const upstreamLink = hoanNgayData.product_url ? String(hoanNgayData.product_url).trim() : undefined;
      const productLink = upstreamLink && (!isTikTok || isSupportedTikTokUrl(upstreamLink)) ? upstreamLink : undefined;
      const shopId = hoanNgayData.shop_id ? String(hoanNgayData.shop_id).trim() : undefined;
      const itemId = hoanNgayData.item_id ? String(hoanNgayData.item_id).trim() : undefined;

      return {
        name: String(hoanNgayData.product_name || "").trim(),
        price,
        originalPrice: originalPrice > price ? originalPrice : price,
        imageUrl: hoanNgayData.image ? String(hoanNgayData.image).trim() : null,
        seller: hoanNgayData.shop_name ? String(hoanNgayData.shop_name).trim() : undefined,
        isVerifiedPrice: price > 0,
        commission: price > 0 ? commission : undefined,
        cashbackRate: price > 0 && Number.isFinite(cashbackRate) && cashbackRate >= 0 ? cashbackRate : undefined,
        productLink,
        shopId,
        itemId,
        rating: hoanNgayData.rating ? String(hoanNgayData.rating) : undefined,
        platform: isTikTok ? "TikTok Shop" : hoanNgayData.platform_name || "Shopee",
        source: "hoanngay",
      };
    } catch {
      return null;
    }
  };

  const runLonghouse = async (): Promise<HoanNgayProduct | null> => {
    if (!isShopee) return null;
    try {
      const lhInfo = await queryLonghouseFallback(cleanLink);
      if (!lhInfo) return null;
      const price = Number(lhInfo.price);
      if (!Number.isFinite(price) || price <= 0) return null;

      const sellerCommission = Number(lhInfo.sellerComFinal);
      const validSellerCom = Number.isFinite(sellerCommission) && sellerCommission >= 0 ? sellerCommission : 0;
      let commission: number | undefined;

      if (lhInfo.isCapped) {
        // Shopee áp trần 20k cho khách cũ, nhưng hoa hồng tổng Shopee chi trả (hiển thị trên trang tiếp thị liên kết)
        // là mức toàn phần không bị ép trần 20k.
        const catRate = getShopeeCategoryRate(String(lhInfo.productName || ""));
        const uncappedShopeeCom = Math.round(price * catRate);
        const finalShopeeCom = Math.max(Number(lhInfo.shopeeComFinal) || 0, uncappedShopeeCom);
        commission = validSellerCom + finalShopeeCom;
      } else {
        const rawCommission = Number(lhInfo.commission ?? lhInfo.shopeeComFinal);
        commission = Number.isFinite(rawCommission) && rawCommission > 0 ? rawCommission : undefined;
      }

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

      return {
        name: String(lhInfo.productName || "").trim(),
        price,
        originalPrice: originalPrice > price ? originalPrice : price,
        imageUrl: lhInfo.imageUrl ? String(lhInfo.imageUrl).trim() : null,
        seller: lhInfo.shopName ? String(lhInfo.shopName).trim() : undefined,
        isVerifiedPrice: true,
        commission,
        sellerCommission: validSellerCom,
        cashbackRate: Number.isFinite(ratePercent) && ratePercent > 0 ? ratePercent : undefined,
        cap: undefined,
        productLink,
        shopId,
        itemId,
        source: "longhouse",
      };
    } catch {
      return null;
    }
  };

  let result: HoanNgayProduct | null = null;
  if (isShopee) {
    // Chạy song song cả Longhouse và HoanNgay:
    // Longhouse kết nối trực tiếp Shopee Open API cho ra số tiền hoa hồng thực tế kèm trần (Cap).
    // HoanNgay bổ sung thông tin seller, rating và hình ảnh.
    const [lhRes, hnRes] = await Promise.all([
      runLonghouse().catch(() => null),
      runHoanNgay().catch(() => null),
    ]);

    if (lhRes && lhRes.price > 0 && lhRes.name) {
      result = {
        ...lhRes,
        imageUrl: lhRes.imageUrl || hnRes?.imageUrl || null,
        seller: lhRes.seller || hnRes?.seller,
        rating: hnRes?.rating || lhRes.rating,
      };
    } else if (hnRes && hnRes.price > 0 && hnRes.name) {
      result = hnRes;
    }
  } else {
    result = await runHoanNgay();
  }

  if (result) {
    setInCache(cacheKey, result);
    if (isShopee && result.shopId && result.itemId) {
      setInCache(`shopee_${result.shopId}_${result.itemId}`, result);
    } else if (isTikTok && result.productLink) {
      setInCache(getCacheKey(result.productLink), result);
    }
  }

  return result;
}

export const lookupFastShopeeProduct = lookupHoanNgayProduct;
