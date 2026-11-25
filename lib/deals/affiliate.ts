/**
 * Shopee Affiliate Link Utility
 * Converts any Shopee product link into an official tracked affiliate link
 * using Shopee's official an_redir gateway.
 */

export const DEFAULT_SHOPEE_AFFILIATE_ID =
  process.env.NEXT_PUBLIC_SHOPEE_AFFILIATE_ID ||
  process.env.SHOPEE_AFFILIATE_ID ||
  process.env.DEFAULT_SHOPEE_AFFILIATE_ID ||
  "17333200656";

/**
 * Extracts a clean URL from a string that may contain text around it.
 * e.g.: "Mua Áo thun tại Shopee ngay: https://s.shopee.vn/abcxyz" -> "https://s.shopee.vn/abcxyz"
 * Also handles scheme-less marketplace URLs embedded in Vietnamese share text
 * e.g.: "Đặt món tại Quán A: shopeefood.vn/u/abc123" -> "https://shopeefood.vn/u/abc123"
 */
export function extractUrlFromText(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  const match = trimmed.match(/(https?:\/\/[^\s<>"'`]+)/i);
  if (match) {
    let url = match[1];
    // Strip trailing punctuation often attached at the end of sentences
    url = url.replace(/[.,;!?)"'\]>]+$/, "");
    return url;
  }
  const bareMatch = trimmed.match(
    /(?:^|[\s:(\[])((?:[a-z0-9-]+\.)?(?:shopee\.vn|shopeefood\.vn|shopeefood\.com\.vn|now\.vn|shope\.ee|shp\.ee|lazada\.vn|lzd\.co)(?:\/[^\s<>"'`]*)?)/i
  );
  if (bareMatch && bareMatch[1]) {
    const bare = bareMatch[1].replace(/[.,;!?)"'\]>]+$/, "");
    return `https://${bare}`;
  }
  return trimmed;
}

/**
 * Strips existing affiliate / UTM query params from Shopee URLs so
 * they don't conflict with our affiliate tracking.
 * Unwraps nested origin_link if an affiliate URL is passed.
 */
export function cleanShopeeUrl(rawUrl: string): string {
  try {
    const extracted = extractUrlFromText(rawUrl);
    if (!extracted.startsWith("http://") && !extracted.startsWith("https://")) {
      return extracted;
    }
    const parsed = new URL(extracted);

    // If an an_redir affiliate link is passed, unpack its origin_link
    if (parsed.searchParams.has("origin_link")) {
      const nested = parsed.searchParams.get("origin_link");
      if (nested) {
        try {
          const decoded = decodeURIComponent(nested);
          return cleanShopeeUrl(decoded);
        } catch {
          return cleanShopeeUrl(nested);
        }
      }
    }

    // Normalize Shopee mobile redirect URLs /opaanlp/<shopId>/<itemId>
    const mOpa = parsed.pathname.match(/\/opaanlp\/(\d+)\/(\d+)/i);
    if (mOpa) {
      parsed.pathname = `/product/${mOpa[1]}/${mOpa[2]}`;
    }

    // Convert ShopeeFood URLs to clean shopeefood.vn so it opens ShopeeFood directly
    const host = parsed.hostname.toLowerCase();
    if (
      host.includes("shopeefood") ||
      host.includes("now.vn") ||
      host.includes("food.shopee.vn") ||
      parsed.pathname.startsWith("/universal-link/now-food") ||
      parsed.pathname.startsWith("/universal-link/shopeefood") ||
      parsed.pathname.startsWith("/now-food")
    ) {
      return toShopeeFoodUniversalUrl(extracted);
    }

    const paramsToKeep = ["sp_atk", "xptdk"];
    const newSearch = new URLSearchParams();
    for (const [key, val] of parsed.searchParams.entries()) {
      if (
        !key.startsWith("utm_") &&
        !key.startsWith("aff_") &&
        key !== "credential_token" &&
        key !== "mmp_pid" &&
        key !== "uls_trackid" &&
        key !== "affiliate_id" &&
        key !== "origin_link"
      ) {
        if (paramsToKeep.includes(key)) {
          newSearch.set(key, val);
        }
      }
    }
    const cleanSearchStr = newSearch.toString();
    return `${parsed.origin}${parsed.pathname}${cleanSearchStr ? `?${cleanSearchStr}` : ""}`;
  } catch {
    return rawUrl;
  }
}

/**
 * Generates an official Shopee Affiliate tracking link
 * Format: https://s.shopee.vn/an_redir?origin_link=<ENCODED_LINK>&affiliate_id=<ID>&sub_id=<SUB_ID>
 */
export function buildShopeeAffiliateUrl(
  rawUrl: string,
  options?: {
    affiliateId?: string;
    subId?: string;
  },
): string {
  const cleanUrl = cleanShopeeUrl(rawUrl);
  const affiliateId = options?.affiliateId || DEFAULT_SHOPEE_AFFILIATE_ID;
  const subId = toShopeeSubId(options?.subId);

  const target = new URL("https://s.shopee.vn/an_redir");
  target.searchParams.set("origin_link", cleanUrl);
  target.searchParams.set("affiliate_id", affiliateId);
  if (subId) {
    target.searchParams.set("sub_id", subId);
  }

  return target.toString();
}

function parseHost(rawUrl: string): { host: string; pathname: string } | null {
  try {
    const extracted = extractUrlFromText(rawUrl);
    if (!extracted) return null;
    const urlStr = extracted.startsWith("http://") || extracted.startsWith("https://")
      ? extracted
      : `https://${extracted}`;
    const parsed = new URL(urlStr);
    return { host: parsed.hostname.toLowerCase(), pathname: parsed.pathname.toLowerCase() };
  } catch {
    return null;
  }
}

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

/**
 * Checks if a URL belongs to ShopeeFood (now.vn, food.shopee.vn, spf.shopee.vn, shopeefood.vn, shopee.vn/now-food)
 */
export function isShopeeFoodUrl(rawUrl: string): boolean {
  const parsed = parseHost(rawUrl);
  if (!parsed) return false;
  const { host, pathname } = parsed;
  if (
    matchesDomain(host, "shopeefood.vn") ||
    matchesDomain(host, "shopeefood.com.vn") ||
    matchesDomain(host, "now.vn")
  ) {
    return true;
  }
  if (matchesDomain(host, "shopee.vn")) {
    if (host.startsWith("food.") || host.startsWith("spf.")) return true;
    if (
      pathname.startsWith("/now-food") ||
      pathname.startsWith("/universal-link/now-food") ||
      pathname.startsWith("/universal-link/shopeefood") ||
      pathname.startsWith("/universal-link/food") ||
      pathname.startsWith("/shopeefood") ||
      pathname.startsWith("/m/shopeefood")
    ) {
      return true;
    }
  }
  // Unwrap nested origin_link / url if already wrapped in an_redir or universal gateway
  try {
    const extracted = extractUrlFromText(rawUrl);
    const full = extracted.startsWith("http://") || extracted.startsWith("https://") ? extracted : `https://${extracted}`;
    const u = new URL(full);
    const nested = u.searchParams.get("origin_link") || u.searchParams.get("url");
    if (nested && nested !== rawUrl) {
      let decoded = nested;
      try {
        decoded = decodeURIComponent(nested);
      } catch {}
      if (decoded !== rawUrl && isShopeeFoodUrl(decoded)) return true;
    }
  } catch {}
  return false;
}

export const DEFAULT_SHOPEEFOOD_URL = "https://shopeefood.vn";

export function isShopeeErrorOrGateUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const p = u.pathname.toLowerCase();
    return (
      p === "/error_page" ||
      p.startsWith("/error_page/") ||
      p.startsWith("/verify/") ||
      p.startsWith("/buyer/login") ||
      p === "/404" ||
      p.startsWith("/404/")
    );
  } catch {
    return false;
  }
}

export function isShopeeShortlinkUrl(rawUrl: string): boolean {
  const parsed = parseHost(rawUrl);
  if (!parsed) return false;
  const { host, pathname } = parsed;
  return (
    host === "spf.shopee.vn" ||
    host === "s.shopee.vn" ||
    host === "vn.shp.ee" ||
    matchesDomain(host, "shp.ee") ||
    matchesDomain(host, "shope.ee") ||
    host.includes("food.shopee") ||
    ((matchesDomain(host, "shopeefood.vn") || matchesDomain(host, "now.vn")) &&
      (pathname.startsWith("/u/") || pathname.startsWith("/s/")))
  );
}

function extractEmbeddedShopeeDestination(html: string): string | null {
  if (!html) return null;
  // 1. Shopee CONFIG.httpUrl
  const configMatch = html.match(/CONFIG\s*=\s*(\{[\s\S]*?\});/);
  if (configMatch) {
    const httpMatch = configMatch[1].match(/httpUrl:\s*"([^"]+)"/);
    if (httpMatch?.[1]) {
      const candidate = httpMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
      if (candidate.startsWith("http") && !isShopeeErrorOrGateUrl(candidate)) {
        return candidate;
      }
    }
  }
  // 2. Direct ShopeeFood or universal-link/now-food URL embedded in ULS bridge HTML / scripts
  const directFoodMatch = html.match(
    /https?:\\?\/\\?\/(?:(?:www\.)?shopeefood\.vn|(?:www\.)?shopee\.vn\\?\/(?:universal-link\\?\/)?now-food)[^"'\\\s<>)]*/i
  );
  if (directFoodMatch?.[0]) {
    const candidate = directFoodMatch[0].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    if (!isShopeeErrorOrGateUrl(candidate)) return candidate;
  }
  // 3. Query param url=... inside ULS deepLinkUrl
  const matchUrl = html.match(/[?&](?:url|origin_link)=([^"&'\s]+)/i);
  if (matchUrl?.[1]) {
    try {
      const decoded = decodeURIComponent(matchUrl[1]);
      if (decoded.startsWith("http") && !isShopeeErrorOrGateUrl(decoded)) {
        return decoded;
      }
    } catch {}
  }
  // 4. Encoded shopeefood.vn / now-food inside deepLinkUrl (e.g. shopeevn://...now-food%2Fshop%2F123456)
  const encodedFoodPath = html.match(/(?:now-food|shopeefood)(?:%2F|\/)(?:shop|presale-deals-detail)(?:%2F|\/)([0-9A-Za-z_-]+)/i);
  if (encodedFoodPath) {
    const seg = encodedFoodPath[0].replace(/%2F/gi, "/").replace(/^shopeefood\//i, "now-food/");
    return `https://shopeefood.vn/${seg}`;
  }
  return null;
}

/**
 * Safely resolves Shopee & ShopeeFood shortlinks (spf.shopee.vn, shopeefood.vn/u/, food.shopee.vn,
 * vn.shp.ee, s.shopee.vn, shope.ee) hop-by-hop using manual redirects so cloud IPs never lose the
 * real restaurant/product URL when Shopee redirects downstream to /buyer/login or /error_page.
 */
export async function resolveShopeeShortlink(
  rawUrl: string,
  options?: { fetcher?: typeof fetch; maxHops?: number }
): Promise<string> {
  if (!rawUrl) return rawUrl;
  const extracted = extractUrlFromText(rawUrl);
  if (!extracted.startsWith("http://") && !extracted.startsWith("https://")) {
    return extracted;
  }
  if (!isShopeeShortlinkUrl(extracted)) {
    return extracted;
  }

  const fetcher = options?.fetcher ?? fetch;
  const maxHops = options?.maxHops ?? 4;
  let current = extracted;

  for (let hop = 0; hop < maxHops; hop++) {
    if (!isShopeeShortlinkUrl(current)) break;
    try {
      const res = await fetcher(current, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(3000),
      });

      const location = res.headers.get("location");
      if (location) {
        const nextUrl = new URL(location, current).toString();
        if (isShopeeErrorOrGateUrl(nextUrl)) {
          break;
        }
        current = nextUrl;
        // Stop immediately once we reach a canonical restaurant or product URL
        if (
          !isShopeeShortlinkUrl(current) &&
          (isShopeeFoodUrl(current) || current.includes("/product/") || /-i\.\d+\.\d+/.test(current))
        ) {
          return current;
        }
        continue;
      }

      if (res.ok) {
        const html = await res.text();
        const embedded = extractEmbeddedShopeeDestination(html);
        if (embedded && embedded !== current && !isShopeeErrorOrGateUrl(embedded)) {
          current = embedded;
          if (!isShopeeShortlinkUrl(current)) return current;
          continue;
        }
      }
      break;
    } catch {
      break;
    }
  }

  return current;
}

/**
 * Unshortens ShopeeFood shortlinks (e.g. shopeefood.vn/u/<slug>, spf.shopee.vn/<slug>, food.shopee.vn/u/<slug>)
 */
export async function unshortenShopeeFoodUrl(
  rawUrl: string,
  options?: { fetcher?: typeof fetch }
): Promise<string> {
  return resolveShopeeShortlink(rawUrl, options);
}

/**
 * Converts any ShopeeFood, Now.vn, or Shopee universal food link into a valid shopeefood.vn link.
 * Preserves the canonical path (/now-food/shop/:id, /now-food/presale-deals-detail/:id, or /:city/:slug)
 * and merchant/restaurant identifiers so opening the link on mobile opens the exact restaurant/dish screen.
 */
export function toShopeeFoodUniversalUrl(rawUrl?: string): string {
  if (!rawUrl || !rawUrl.trim()) return DEFAULT_SHOPEEFOOD_URL;
  try {
    const extracted = extractUrlFromText(rawUrl);
    if (!extracted.startsWith("http://") && !extracted.startsWith("https://")) {
      return DEFAULT_SHOPEEFOOD_URL;
    }
    if (isShopeeErrorOrGateUrl(extracted)) {
      return DEFAULT_SHOPEEFOOD_URL;
    }
    const parsed = new URL(extracted);
    const host = parsed.hostname.toLowerCase();

    // Never mangle an unexpanded shortlink host (e.g. spf.shopee.vn/<code>) onto shopeefood.vn/<code> (which 404s)
    if (host === "spf.shopee.vn" || host === "s.shopee.vn" || host === "vn.shp.ee" || matchesDomain(host, "shp.ee") || matchesDomain(host, "shope.ee")) {
      return parsed.toString();
    }

    let pathname = parsed.pathname;
    if (pathname.startsWith("/universal-link/now-food")) {
      pathname = pathname.replace(/^\/universal-link/, "");
    } else if (pathname.startsWith("/universal-link/shopeefood")) {
      pathname = pathname.replace(/^\/universal-link\/shopeefood/, "/now-food");
    } else if (pathname.startsWith("/universal-link/food")) {
      pathname = pathname.replace(/^\/universal-link\/food/, "/now-food");
    }

    const cleanPath = pathname.replace(/^\/+/, "");
    const cleanSearch = new URLSearchParams();
    for (const [key, val] of parsed.searchParams.entries()) {
      if (
        !key.startsWith("utm_") &&
        !key.startsWith("aff_") &&
        !key.startsWith("stm_") &&
        key !== "shareChannel" &&
        key !== "fbclid" &&
        key !== "uls_trackid"
      ) {
        cleanSearch.set(key, val);
      }
    }
    const searchStr = cleanSearch.toString();
    return cleanPath ? `https://shopeefood.vn/${cleanPath}${searchStr ? `?${searchStr}` : ""}` : DEFAULT_SHOPEEFOOD_URL;
  } catch {
    return DEFAULT_SHOPEEFOOD_URL;
  }
}

/**
 * Generates an official ShopeeFood link that preserves tracking sub_id and opens
 * the restaurant directly in the ShopeeFood App without 404 routing errors.
 */
export function buildShopeeFoodAffiliateUrl(
  rawUrl?: string,
  options?: {
    affiliateId?: string;
    subId?: string;
  }
): string {
  const targetUrl = toShopeeFoodUniversalUrl(rawUrl);
  const affiliateId = options?.affiliateId || DEFAULT_SHOPEE_AFFILIATE_ID;
  try {
    const parsed = new URL(targetUrl);
    if (options?.subId) {
      parsed.searchParams.set("sub_id", toShopeeSubId(options.subId));
    }
    if (affiliateId) {
      parsed.searchParams.set("affiliate_id", affiliateId);
    }
    return parsed.toString();
  } catch {
    return targetUrl;
  }
}

/**
 * Checks if a URL belongs to Shopee (web, shortlink, universal link, or ShopeeFood)
 */
export function isShopeeUrl(rawUrl: string): boolean {
  const parsed = parseHost(rawUrl);
  if (!parsed) return false;
  const { host } = parsed;
  if (
    matchesDomain(host, "shopee.vn") ||
    matchesDomain(host, "shope.ee") ||
    matchesDomain(host, "shp.ee")
  ) {
    return true;
  }
  return isShopeeFoodUrl(rawUrl);
}

/**
 * Checks if a URL belongs to Lazada Vietnam (web, mobile, shortlinks)
 */
export function isLazadaUrl(rawUrl: string): boolean {
  const parsed = parseHost(rawUrl);
  if (!parsed) return false;
  const { host } = parsed;
  return (
    matchesDomain(host, "lazada.vn") ||
    matchesDomain(host, "lzd.co")
  );
}

/**
 * Extracts numeric Lazada productId (itemId) from standard Lazada PDP or deeplink URLs.
 * Examples:
 * - https://www.lazada.vn/products/pdp-i13415412621-s117139082455.html -> "13415412621"
 * - https://www.lazada.vn/products/ten-san-pham-i987654321.html -> "987654321"
 * - lazada://vn/pdp?itemId=13415412621 -> "13415412621"
 */
export function extractLazadaProductId(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const m1 = rawUrl.match(/-i(\d{5,})(?:-s\d+)?(?:\.html|[/?#]|$)/i);
  if (m1) return m1[1];
  const m2 = rawUrl.match(/[?&](?:itemId|item_id|productId|product_id)=(\d{5,})/i);
  if (m2) return m2[1];
  return null;
}

/**
 * Cleans a Lazada URL before sending to Lazada Open Platform /marketing/getlink.
 * - Preserves required query parameters (like `?t=...`) on shortlinks (`s.lazada.vn`, `c.lazada.vn`, `lzd.co`)
 *   while stripping previous affiliate sub-tracking overrides.
 * - Strips tracking/UTM noise from full `lazada.vn` product URLs.
 */
export function cleanLazadaUrl(rawUrl: string): string {
  const extracted = extractUrlFromText(rawUrl);
  if (!extracted) return rawUrl.trim();
  const normalized =
    extracted.startsWith("http://") || extracted.startsWith("https://")
      ? extracted
      : `https://${extracted}`;
  try {
    const u = new URL(normalized);
    const host = u.hostname.toLowerCase();
    const isShort =
      host === "s.lazada.vn" ||
      host === "c.lazada.vn" ||
      host === "lzd.co" ||
      host.endsWith(".lzd.co");

    const subKeys = [
      "sub_aff_id",
      "subAffId",
      "sub_id1",
      "sub_id2",
      "sub_id3",
      "sub_id4",
      "sub_id5",
      "sub_id6",
      "subId1",
      "subId2",
      "subId3",
      "subId4",
      "subId5",
      "subId6",
    ];
    for (const k of subKeys) u.searchParams.delete(k);

    if (!isShort) {
      const stripKeys = [
        "spm",
        "clickTrackInfo",
        "pvid",
        "scm",
        "exlaz",
        "dsource",
        "laz_share_info",
        "laz_token",
        "from_affiliate",
        "fbclid",
        "gclid",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
      ];
      for (const k of stripKeys) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return normalized;
  }
}

/**
 * Checks if a URL belongs to TikTok or TikTok Shop
 */
export function isTikTokUrl(rawUrl: string): boolean {
  const parsed = parseHost(rawUrl);
  if (!parsed) return false;
  const { host } = parsed;
  return (
    matchesDomain(host, "tiktok.com") ||
    matchesDomain(host, "douyin.com")
  );
}

/**
 * Cleans a TikTok URL by removing trailing junk or whitespace
 */
export function cleanTikTokUrl(rawUrl: string): string {
  try {
    const extracted = extractUrlFromText(rawUrl);
    if (!extracted.startsWith("http://") && !extracted.startsWith("https://")) {
      return extracted;
    }
    const parsed = new URL(extracted);
    return parsed.toString();
  } catch {
    return extractUrlFromText(rawUrl);
  }
}

export type AccessTradeCreateLinkResult = {
  success: boolean;
  affiliateUrl: string;
  shortUrl?: string;
  message?: string;
  code?: string;
};

/**
 * Generates an official tracked TikTok Shop affiliate link via AccessTrade API (v2)
 */
export async function generateAccessTradeTikTokLink(
  productUrl: string,
  options?: {
    subId?: string;
    authToken?: string;
  }
): Promise<AccessTradeCreateLinkResult> {
  const cleanUrl = cleanTikTokUrl(productUrl);
  const token = options?.authToken || process.env.ACCESSTRADE_TOKEN;
  const subId = options?.subId ? formatSubIdForUser(options.subId) : "dealhoan";

  if (!token) {
    return {
      success: false,
      affiliateUrl: cleanUrl,
      message: "Chưa cấu hình ACCESSTRADE_TOKEN trong hệ thống",
    };
  }

  try {
    const endpoint = "https://api.accesstrade.vn/v2/tiktokshop_product_feeds/create_link";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        product_url: cleanUrl,
        sub_1: subId,
        utm_source: "dealhoan",
        utm_medium: "affiliate",
      }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        success: false,
        affiliateUrl: cleanUrl,
        message: `Lỗi kết nối AccessTrade API (HTTP ${res.status})`,
      };
    }

    const body = await res.json();
    if (body.status && body.data) {
      const affLink = body.data.short_link || body.data.aff_link || body.data;
      if (typeof affLink === "string" && affLink.startsWith("http")) {
        return {
          success: true,
          affiliateUrl: affLink,
          shortUrl: body.data.short_link || affLink,
          message: "Tạo link affiliate TikTok Shop thành công",
        };
      }
    }

    return {
      success: false,
      affiliateUrl: cleanUrl,
      message:
        body.message === "The link is not part of the campaign"
          ? "Sản phẩm này người bán chưa bật hoa hồng mở trên TikTok Shop"
          : (body.message || "Không thể tạo link tiếp thị cho sản phẩm này"),
      code: body.code,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error";
    return {
      success: false,
      affiliateUrl: cleanUrl,
      message: msg,
    };
  }
}

/**
 * Generates a clean, branded DealHoàn short link
 * e.g.:
 * - For Shopee product: https://dealhoan.vn/go?s=401425654.17054556097
 * - For other links: https://dealhoan.vn/go?url=...
 */
export function buildCustomShortUrl(
  rawUrl: string,
  options?: {
    baseUrl?: string;
    subId?: string;
    shopId?: string;
    itemId?: string;
  },
): string {
  let base = (options?.baseUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://dealhoan.com").trim();
  if (!base.startsWith("http://") && !base.startsWith("https://")) {
    base = `https://${base}`;
  }
  const subId = options?.subId || "dealhoan";

  // If shopId and itemId are explicitly provided, immediately build standard /go?s=...
  if (options?.shopId && options?.itemId) {
    const shortUrl = new URL("/go", base);
    shortUrl.searchParams.set("s", `${options.shopId}.${options.itemId}`);
    if (subId && subId !== "dealhoan" && subId !== "calc") {
      shortUrl.searchParams.set("sub", subId);
    }
    return shortUrl.toString();
  }

  const cleanUrl = isTikTokUrl(rawUrl) ? cleanTikTokUrl(rawUrl) : cleanShopeeUrl(rawUrl);

  try {
    const u = new URL(cleanUrl.startsWith("http") ? cleanUrl : `https://${cleanUrl}`);
    const host = u.hostname.toLowerCase();

    // Check if it is a Shopee product
    if (host.includes("shopee.vn") || host.includes("shp.ee")) {
      const match1 = u.pathname.match(/\/product\/(\d+)\/(\d+)/i);
      const match2 = u.pathname.match(/-i\.(\d+)\.(\d+)/i);
      const match = match1 || match2;
      if (match) {
        const shopId = match[1];
        const itemId = match[2];
        const shortUrl = new URL("/go", base);
        shortUrl.searchParams.set("s", `${shopId}.${itemId}`);
        if (subId && subId !== "dealhoan" && subId !== "calc") {
          shortUrl.searchParams.set("sub", subId);
        }
        return shortUrl.toString();
      }
    }

    // Generic fallback for other URLs
    const shortUrl = new URL("/go", base);
    shortUrl.searchParams.set("url", cleanUrl);
    if (subId && subId !== "dealhoan" && subId !== "calc") {
      shortUrl.searchParams.set("sub", subId);
    }
    return shortUrl.toString();
  } catch {
    const shortUrl = new URL("/go", base);
    shortUrl.searchParams.set("url", rawUrl);
    return shortUrl.toString();
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Standardizes subId format for tracking user cashbacks.
 *
 * Shopee Affiliate only accepts letters and digits inside a sub_id and uses "-"
 * to split up to 5 sub_id levels. The old `u_{uuid}` format therefore broke:
 * "_" is rejected and the UUID's hyphens were split into sub_id1..sub_id5, so
 * conversion reports could not be matched back to the customer.
 *
 * Format: dh{uuid-without-hyphens} (e.g. dh1f162a518baa404eb16aca4e2d2c4b8d)
 */
export function formatSubIdForUser(userId?: string | null): string {
  if (!userId) return "dealhoan";
  const cleanId = userId.trim();
  if (!cleanId || cleanId === "calc" || cleanId === "dealhoan") return "dealhoan";
  const parsed = parseUserIdFromSubId(cleanId);
  if (parsed && UUID_PATTERN.test(parsed)) return `dh${parsed.replace(/-/g, "")}`;
  const alnum = cleanId.replace(/[^A-Za-z0-9]/g, "");
  return alnum ? `dh${alnum}`.slice(0, 50) : "dealhoan";
}

/** Makes any tracking value safe for Shopee's alphanumeric sub_id field. */
export function toShopeeSubId(subId?: string | null): string {
  const clean = subId?.trim();
  if (!clean || clean === "dealhoan" || clean === "calc") return clean || "dealhoan";
  return formatSubIdForUser(clean);
}

/**
 * Extracts userId from a tracking subId string.
 * Handles dh{32 hex}, legacy u_{uuid}, raw {uuid}, legacy split reports
 * (sub_id1..5 joined by "-") and legacy short hex prefixes.
 */
export function parseUserIdFromSubId(subId?: string | null): string | null {
  if (!subId) return null;
  const clean = subId.trim();
  if (!clean || clean === "dealhoan" || clean === "calc") return null;
  const uuid = clean.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0].toLowerCase();
  const first = clean.split("-")[0];
  const match = first.match(/^(?:dh|u_?)?([0-9a-f]{8,32})$/i);
  if (!match) return null;
  const hex = match[1].toLowerCase();
  if (hex.length === 32) {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return hex;
}

