import { createHmac } from "node:crypto";
import {
  cleanLazadaUrl,
  extractLazadaProductId,
  formatSubIdForUser,
  isLazadaUrl,
} from "@/lib/deals/affiliate";
import { recordCashbackOrder, type RecordCashbackOrderParams } from "@/lib/deals/cashback";

export { isLazadaUrl, cleanLazadaUrl, extractLazadaProductId };

export const DEFAULT_LAZADA_API_BASE = "https://api.lazada.vn/rest";

export interface LazadaAffiliateConfig {
  appKey: string;
  appSecret: string;
  userToken: string;
  apiBase: string;
}

export function getLazadaAffiliateConfig(
  env: Record<string, string | undefined> = process.env
): LazadaAffiliateConfig | null {
  const appKey = (env.LAZADA_APP_KEY || "").trim();
  const appSecret = (env.LAZADA_APP_SECRET || "").trim();
  const userToken = (env.LAZADA_USER_TOKEN || "").trim();
  const apiBase = (env.LAZADA_API_BASE || DEFAULT_LAZADA_API_BASE).trim().replace(/\/+$/, "");

  if (!appKey || !appSecret || !userToken) {
    return null;
  }
  return { appKey, appSecret, userToken, apiBase };
}

export function isLazadaAffiliateConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return getLazadaAffiliateConfig(env) !== null;
}

/**
 * Computes Lazada Open Platform HMAC-SHA256 request signature.
 * Canonical string: apiPath + sorted(key + value)..., HMAC-SHA256 with appSecret, uppercase hex.
 */
export function signLazadaRequest(
  apiPath: string,
  params: Record<string, string>,
  appSecret: string
): string {
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== "sign" && params[k] !== undefined && params[k] !== "")
    .sort();
  let raw = apiPath;
  for (const key of sortedKeys) {
    raw += `${key}${params[key]}`;
  }
  return createHmac("sha256", appSecret).update(raw).digest("hex").toUpperCase();
}

export async function callLazadaOpenApi<T = Record<string, unknown>>(
  apiPath: string,
  extraParams: Record<string, string | number | undefined>,
  options?: {
    config?: LazadaAffiliateConfig | null;
    fetcher?: typeof fetch;
    now?: number;
    timeoutMs?: number;
  }
): Promise<{
  ok: boolean;
  status: number;
  code?: string;
  message?: string;
  data?: T;
  raw?: unknown;
}> {
  const config = options?.config ?? getLazadaAffiliateConfig();
  if (!config) {
    return {
      ok: false,
      status: 503,
      code: "LAZADA_NOT_CONFIGURED",
      message: "Chưa cấu hình LAZADA_APP_KEY / LAZADA_APP_SECRET / LAZADA_USER_TOKEN.",
    };
  }

  const params: Record<string, string> = {
    app_key: config.appKey,
    timestamp: String(options?.now ?? Date.now()),
    sign_method: "sha256",
    userToken: config.userToken,
  };

  for (const [k, v] of Object.entries(extraParams)) {
    if (v !== undefined && v !== null && String(v) !== "") {
      params[k] = String(v);
    }
  }

  params.sign = signLazadaRequest(apiPath, params, config.appSecret);

  const url = `${config.apiBase}${apiPath}?${new URLSearchParams(params).toString()}`;
  const fetcher = options?.fetcher ?? fetch;

  try {
    const res = await fetcher(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(options?.timeoutMs ?? 9000),
    });

    const raw = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !raw) {
      return {
        ok: false,
        status: res.status,
        code: "HTTP_ERROR",
        message: `Lazada API lỗi HTTP ${res.status}`,
        raw,
      };
    }

    const topCode = String(raw.code ?? "");
    const resultObj = (raw.result && typeof raw.result === "object"
      ? raw.result
      : null) as Record<string, unknown> | null;

    if (topCode !== "0" || (resultObj && resultObj.success === false)) {
      return {
        ok: false,
        status: res.status,
        code: topCode || String(resultObj?.errorCode ?? "API_ERROR"),
        message: String(raw.message || resultObj?.errorMsg || "Lazada API trả về lỗi"),
        raw,
      };
    }

    return {
      ok: true,
      status: res.status,
      code: topCode,
      data: (resultObj ? resultObj.data : raw.data) as T,
      raw,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 502,
      code: "NETWORK_ERROR",
      message: err instanceof Error ? err.message : "Lỗi kết nối Lazada API",
    };
  }
}

export function parseLazadaPercent(val: unknown): number {
  if (typeof val === "number" && Number.isFinite(val)) {
    return val > 0 && val <= 1 ? Number((val * 100).toFixed(2)) : Number(val.toFixed(2));
  }
  if (typeof val === "string") {
    const cleaned = val.replace(/%/g, "").replace(/,/g, ".").trim();
    const num = Number(cleaned);
    if (Number.isFinite(num) && num >= 0) {
      return Number(num.toFixed(2));
    }
  }
  return 0;
}

export interface LazadaLinkResult {
  success: boolean;
  affiliateUrl: string;
  productId?: string;
  productName?: string;
  originalUrl?: string;
  commissionRatePercent: number;
  regularCommission?: string;
  bonusCommission?: string;
  error?: string;
}

type LazadaBatchLinkItem = {
  productId?: string | number;
  productName?: string;
  originalUrl?: string;
  regularPromotionLink?: string;
  bonusPromotionLink?: string;
  promotionLink?: string;
  regularCommission?: string;
  bonusCommission?: string;
};

type LazadaBatchLinkResponse = {
  urlBatchGetLinkInfoList?: LazadaBatchLinkItem[];
  productBatchGetLinkInfoList?: LazadaBatchLinkItem[];
  errorInfoList?: Array<{ errorMsg?: string; errorCode?: string }>;
};

function parseLinkInfoItem(item: LazadaBatchLinkItem | undefined, fallbackUrl: string): LazadaLinkResult | null {
  if (!item) return null;
  const link = (item.bonusPromotionLink || item.regularPromotionLink || item.promotionLink || "").trim();
  if (!link || !link.startsWith("http")) return null;

  const bonusPct = parseLazadaPercent(item.bonusCommission);
  const regularPct = parseLazadaPercent(item.regularCommission);
  const commissionRatePercent = Math.max(bonusPct, regularPct);

  return {
    success: true,
    affiliateUrl: link,
    productId: item.productId !== undefined ? String(item.productId).trim() : undefined,
    productName: item.productName ? String(item.productName).trim() : undefined,
    originalUrl: item.originalUrl ? String(item.originalUrl).trim() : fallbackUrl,
    commissionRatePercent,
    regularCommission: item.regularCommission,
    bonusCommission: item.bonusCommission,
  };
}

/**
 * Converts any Lazada Vietnam URL (including `s.lazada.vn` shortlinks) or productId
 * into an official direct Lazada Affiliate tracking link with `sub_aff_id` + `sub_id1`.
 */
export async function generateLazadaAffiliateLink(
  rawUrl: string,
  options?: {
    subId?: string;
    config?: LazadaAffiliateConfig | null;
    fetcher?: typeof fetch;
    now?: number;
  }
): Promise<LazadaLinkResult> {
  const cleanUrl = cleanLazadaUrl(rawUrl);
  const safeSubId = formatSubIdForUser(options?.subId);

  const byUrl = await callLazadaOpenApi<LazadaBatchLinkResponse>(
    "/marketing/getlink",
    {
      inputType: "url",
      inputValue: cleanUrl,
      subAffId: safeSubId,
      subId1: safeSubId,
    },
    { config: options?.config, fetcher: options?.fetcher, now: options?.now }
  );

  if (byUrl.ok && byUrl.data) {
    const first =
      byUrl.data.urlBatchGetLinkInfoList?.[0] || byUrl.data.productBatchGetLinkInfoList?.[0];
    const parsed = parseLinkInfoItem(first, cleanUrl);
    if (parsed) return parsed;
  }

  // Fallback by productId if URL contains an explicit itemId
  const extractedPid = extractLazadaProductId(cleanUrl);
  if (extractedPid) {
    const byPid = await callLazadaOpenApi<LazadaBatchLinkResponse>(
      "/marketing/getlink",
      {
        inputType: "productId",
        inputValue: extractedPid,
        subAffId: safeSubId,
        subId1: safeSubId,
      },
      { config: options?.config, fetcher: options?.fetcher, now: options?.now }
    );

    if (byPid.ok && byPid.data) {
      const first =
        byPid.data.productBatchGetLinkInfoList?.[0] || byPid.data.urlBatchGetLinkInfoList?.[0];
      const parsed = parseLinkInfoItem(first, cleanUrl);
      if (parsed) return parsed;
    }
  }

  const firstErr = byUrl.data?.errorInfoList?.[0]?.errorMsg;
  return {
    success: false,
    affiliateUrl: cleanUrl,
    commissionRatePercent: 0,
    error: firstErr || byUrl.message || "Không thể tạo link Lazada Affiliate cho sản phẩm này.",
  };
}

export interface LazadaProductFeedItem {
  productId: string;
  name: string;
  price: number;
  seller: string;
  brandName: string;
  imageUrl: string | null;
  commissionRatePercent: number;
  commissionAmount: number;
  bonusOfferFlag: boolean;
  outOfStock: boolean;
}

type RawLazadaFeedItem = {
  productId?: string | number;
  productName?: string;
  discountPrice?: number | string;
  price?: number | string;
  sellerName?: string;
  brandName?: string;
  pictures?: string[];
  totalCommissionRate?: number | string;
  cpsCommissionRate?: number | string;
  totalCommissionAmount?: number | string;
  cpsCommissionAmount?: number | string;
  bonusOfferFlag?: boolean;
  outOfStock?: boolean;
};

/**
 * Looks up official live product metadata (price, image, seller, exact commission)
 * directly from Lazada Open Platform `/marketing/product/feed` by productIds.
 */
export async function lookupLazadaProductsByIds(
  productIds: string[],
  options?: {
    config?: LazadaAffiliateConfig | null;
    fetcher?: typeof fetch;
    now?: number;
  }
): Promise<LazadaProductFeedItem[]> {
  const numericIds = productIds
    .map((id) => Number(String(id).replace(/\D/g, "")))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  if (numericIds.length === 0) return [];

  const res = await callLazadaOpenApi<RawLazadaFeedItem[]>(
    "/marketing/product/feed",
    {
      offerType: "1",
      productIds: JSON.stringify(numericIds),
      limit: String(Math.min(50, numericIds.length)),
      page: "1",
    },
    { config: options?.config, fetcher: options?.fetcher, now: options?.now }
  );

  if (!res.ok || !Array.isArray(res.data)) return [];

  return res.data
    .map((item): LazadaProductFeedItem | null => {
      const pid = item.productId !== undefined ? String(item.productId) : "";
      const price = Math.round(Number(item.discountPrice ?? item.price ?? 0));
      if (!pid || !Number.isFinite(price) || price <= 0) return null;

      const rateRaw = Number(item.totalCommissionRate ?? item.cpsCommissionRate ?? 0);
      const commissionRatePercent =
        Number.isFinite(rateRaw) && rateRaw > 0
          ? rateRaw <= 1
            ? Number((rateRaw * 100).toFixed(2))
            : Number(rateRaw.toFixed(2))
          : 0;
      const commAmtRaw = Number(item.totalCommissionAmount ?? item.cpsCommissionAmount ?? 0);
      const commissionAmount =
        Number.isFinite(commAmtRaw) && commAmtRaw > 0
          ? Math.round(commAmtRaw)
          : commissionRatePercent > 0
            ? Math.round((price * commissionRatePercent) / 100)
            : 0;

      const pictures = Array.isArray(item.pictures) ? item.pictures : [];
      const firstImg = pictures.find((p) => typeof p === "string" && p.startsWith("http")) || null;

      return {
        productId: pid,
        name: String(item.productName || "").trim(),
        price,
        seller: String(item.sellerName || item.brandName || "Lazada").trim(),
        brandName: String(item.brandName || "").trim(),
        imageUrl: firstImg,
        commissionRatePercent,
        commissionAmount,
        bonusOfferFlag: Boolean(item.bonusOfferFlag),
        outOfStock: Boolean(item.outOfStock),
      };
    })
    .filter((x): x is LazadaProductFeedItem => x !== null);
}

export interface ResolvedLazadaProduct {
  productId?: string;
  name: string;
  price: number;
  imageUrl: string | null;
  seller: string;
  affiliateUrl: string;
  canonicalUrl: string;
  grossCommission: number;
  commissionRatePercent: number;
  isVerifiedPrice: boolean;
  bonusOfferFlag: boolean;
}

/**
 * Full server-side Lazada link resolver using ONLY Lazada Official Open Platform API.
 * 1. Calls `/marketing/getlink` to resolve shortlinks, obtain productId, commission rate, and tracked affiliate link.
 * 2. Calls `/marketing/product/feed` to obtain exact live VND price, CDN image, seller, and exact gross commission.
 */
export async function resolveLazadaProduct(
  rawUrl: string,
  options?: {
    subId?: string;
    config?: LazadaAffiliateConfig | null;
    fetcher?: typeof fetch;
    now?: number;
  }
): Promise<{
  ok: boolean;
  product?: ResolvedLazadaProduct;
  errorCode?: string;
  message?: string;
}> {
  const config = options?.config ?? getLazadaAffiliateConfig();
  if (!config) {
    return {
      ok: false,
      errorCode: "lazada_not_configured",
      message: "Lazada Affiliate chưa được cấu hình trên máy chủ.",
    };
  }

  const linkRes = await generateLazadaAffiliateLink(rawUrl, {
    subId: options?.subId,
    config,
    fetcher: options?.fetcher,
    now: options?.now,
  });

  if (!linkRes.success || !linkRes.affiliateUrl) {
    return {
      ok: false,
      errorCode: "product_unresolved",
      message:
        linkRes.error ||
        "Chưa tìm thấy sản phẩm Lazada từ link này. Hãy sao chép link sản phẩm trên Lazada rồi thử lại.",
    };
  }

  const productId = linkRes.productId || extractLazadaProductId(rawUrl) || undefined;
  let feedItem: LazadaProductFeedItem | null = null;

  if (productId) {
    const items = await lookupLazadaProductsByIds([productId], {
      config,
      fetcher: options?.fetcher,
      now: options?.now,
    });
    feedItem = items.find((i) => i.productId === productId) || items[0] || null;
  }

  const name = feedItem?.name || linkRes.productName || "";
  const price = feedItem?.price ?? 0;
  const commissionRatePercent =
    feedItem && feedItem.commissionRatePercent > 0
      ? feedItem.commissionRatePercent
      : linkRes.commissionRatePercent;
  const grossCommission =
    feedItem && feedItem.commissionAmount > 0
      ? feedItem.commissionAmount
      : price > 0 && commissionRatePercent > 0
        ? Math.round((price * commissionRatePercent) / 100)
        : 0;

  return {
    ok: true,
    product: {
      productId,
      name,
      price,
      imageUrl: feedItem?.imageUrl ?? null,
      seller: feedItem?.seller || "Lazada",
      affiliateUrl: linkRes.affiliateUrl,
      canonicalUrl: productId
        ? `https://www.lazada.vn/products/pdp-i${productId}.html`
        : cleanLazadaUrl(rawUrl),
      grossCommission,
      commissionRatePercent,
      isVerifiedPrice: Boolean(feedItem && feedItem.price > 0),
      bonusOfferFlag: Boolean(feedItem?.bonusOfferFlag),
    },
  };
}

/**
 * Formats a timestamp in Asia/Ho_Chi_Minh timezone as YYYY-MM-DD for Lazada reporting APIs.
 */
export function formatVietnamDate(ms: number): string {
  const vnDate = new Date(ms + 7 * 60 * 60 * 1000);
  return vnDate.toISOString().slice(0, 10);
}

/**
 * Maps Lazada Conversion Report / Postback status & validity fields into DealHoàn order status.
 * - Invalid/cancelled/returned/refunded -> "rejected"
 * - Fulfilled/settled/approved/paid/completed (and valid) -> "completed"
 * - Pending/created/confirmed/shipped/delivered -> "pending"
 */
export function parseLazadaConversionStatus(record: Record<string, unknown>): "pending" | "completed" | "rejected" | null {
  const validity = String(record.validity ?? record.isValid ?? "").trim().toLowerCase();
  const status = String(
    record.status ?? record.orderStatus ?? record.fulfillmentStatus ?? record.conversionStatus ?? ""
  )
    .trim()
    .toLowerCase();

  if (
    validity === "invalid" ||
    validity === "false" ||
    validity === "0" ||
    validity === "rejected" ||
    validity === "cancelled" ||
    validity === "canceled" ||
    validity === "returned" ||
    validity === "refunded"
  ) {
    return "rejected";
  }

  if (
    ["cancelled", "canceled", "returned", "refunded", "invalid", "rejected", "failed", "3"].includes(status)
  ) {
    return "rejected";
  }

  if (
    ["fulfilled", "settled", "paid", "approved", "completed", "2"].includes(status)
  ) {
    return "completed";
  }

  if (
    status === "" ||
    ["pending", "created", "confirmed", "shipped", "delivered", "processing", "unpaid", "valid", "0", "1"].includes(status)
  ) {
    return "pending";
  }

  return null;
}

/**
 * Builds a deterministic, collision-free order_id for Lazada conversions.
 * Handles multi-SKU orders cleanly so partial cancellations never overwrite another item.
 */
export function buildLazadaOrderId(record: Record<string, unknown>): string {
  const baseOrderId = String(
    record.orderId ?? record.order_id ?? record.orderNumber ?? ""
  ).trim();
  const lineId = String(
    record.orderLineId ??
      record.order_line_id ??
      record.conversionId ??
      record.conversion_id ??
      record.skuId ??
      record.sku_id ??
      record.sku ??
      ""
  ).trim();

  if (baseOrderId && lineId && lineId !== baseOrderId) {
    return `${baseOrderId}-${lineId}`;
  }
  return baseOrderId || lineId;
}

function parseLazadaMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "").trim();
    const num = Number(cleaned);
    if (Number.isFinite(num) && num >= 0) {
      return Math.round(num);
    }
  }
  return 0;
}

function parseLazadaTimestamp(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const raw = value.trim();
    if (/^\d{10,13}$/.test(raw)) {
      const n = Number(raw);
      return new Date(n < 1e12 ? n * 1000 : n).toISOString();
    }
    const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "+07:00");
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  return undefined;
}

/**
 * Syncs Lazada Affiliate conversions directly from Lazada Open Platform `/marketing/conversion/report`.
 */
export async function syncLazadaOrders(options: {
  daysBack?: number;
  config?: LazadaAffiliateConfig | null;
  fetcher?: typeof fetch;
  record?: typeof recordCashbackOrder;
  now?: number;
} = {}) {
  const config = options.config ?? getLazadaAffiliateConfig();
  if (!config) {
    return {
      code: 503,
      body: {
        success: false,
        status: "lazada_not_configured",
        message: "Chưa cấu hình LAZADA_APP_KEY / LAZADA_APP_SECRET / LAZADA_USER_TOKEN.",
        processed: 0,
        scanned: 0,
        unmatched: 0,
        failed: 0,
      },
    };
  }

  const nowMs = options.now ?? Date.now();
  const daysBack = Math.max(1, Math.min(90, options.daysBack ?? 30));
  const dateEnd = formatVietnamDate(nowMs);
  const dateStart = formatVietnamDate(nowMs - daysBack * 24 * 60 * 60 * 1000);
  const record = options.record ?? recordCashbackOrder;

  let processed = 0;
  let scanned = 0;
  let unmatched = 0;
  let failed = 0;
  const seenIds = new Set<string>();
  const counts = () => ({ processed, scanned, unmatched, failed, dateStart, dateEnd });

  for (let page = 1; page <= 20; page++) {
    const res = await callLazadaOpenApi<unknown>(
      "/marketing/conversion/report",
      {
        dateStart,
        dateEnd,
        limit: "50",
        page: String(page),
      },
      { config, fetcher: options.fetcher, now: nowMs }
    );

    if (!res.ok) {
      return {
        code: 502,
        body: {
          success: false,
          status: "lazada_report_unavailable",
          message: res.message || "Không thể lấy báo cáo chuyển đổi từ Lazada Open API.",
          ...counts(),
        },
      };
    }

    const rawData = res.data;
    const list: Record<string, unknown>[] = Array.isArray(rawData)
      ? (rawData as Record<string, unknown>[])
      : rawData &&
          typeof rawData === "object" &&
          Array.isArray((rawData as Record<string, unknown>).records)
        ? ((rawData as Record<string, unknown>).records as Record<string, unknown>[])
        : rawData &&
            typeof rawData === "object" &&
            Array.isArray((rawData as Record<string, unknown>).list)
          ? ((rawData as Record<string, unknown>).list as Record<string, unknown>[])
          : [];

    for (const item of list) {
      scanned++;
      const orderId = buildLazadaOrderId(item);
      const subId = String(
        item.subAffId ??
          item.sub_aff_id ??
          item.subId1 ??
          item.sub_id1 ??
          item.subId2 ??
          item.sub_id2 ??
          item.subId ??
          item.sub_id ??
          ""
      ).trim();

      if (!orderId || !subId || subId === "dealhoan" || subId === "calc") {
        unmatched++;
        continue;
      }

      if (seenIds.has(orderId)) {
        failed++;
        continue;
      }
      seenIds.add(orderId);

      const status = parseLazadaConversionStatus(item);
      if (!status) {
        failed++;
        continue;
      }

      const rawComm =
        item.estPayout ??
        item.totalPayout ??
        item.payout ??
        item.commission ??
        item.commissionAmount;
      if (
        rawComm === undefined ||
        rawComm === null ||
        rawComm === "" ||
        /-/.test(String(rawComm))
      ) {
        failed++;
        continue;
      }

      const commissionAmount = parseLazadaMoney(rawComm);
      const orderValue = parseLazadaMoney(
        item.orderAmt ?? item.orderAmount ?? item.paidPrice ?? item.gmv ?? 0
      );
      const productName = String(
        item.skuName ??
          item.productName ??
          item.itemName ??
          item.offerName ??
          "Sản phẩm Lazada mua qua DealHoàn"
      ).trim();
      const orderedAt = parseLazadaTimestamp(
        item.conversionTime ?? item.clickTime ?? item.orderTime ?? item.createdTime
      );

      const params: RecordCashbackOrderParams = {
        orderId,
        subId,
        platform: "Lazada",
        productName,
        orderValue,
        commissionAmount,
        status,
        orderedAt,
        note: "Đồng bộ từ báo cáo chuyển đổi Lazada Affiliate chính chủ",
        actorType: "cron",
        actorId: "syncLazadaOrders",
      };

      const recRes = await record(params);
      if (recRes.success) processed++;
      else failed++;
    }

    if (list.length < 50) {
      return {
        code: failed > 0 ? 502 : 200,
        body: {
          success: failed === 0,
          status: failed > 0 ? "partial_failure" : "synced",
          ...counts(),
        },
      };
    }
  }

  return {
    code: 502,
    body: {
      success: false,
      status: "pagination_limit",
      ...counts(),
    },
  };
}
