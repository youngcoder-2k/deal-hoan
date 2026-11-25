import { createHmac, timingSafeEqual } from "node:crypto";
import {
  cleanTikTokUrl,
  extractTikTokProductId,
  formatSubIdForUser,
  isTikTokUrl,
} from "@/lib/deals/affiliate";
import { recordCashbackOrder, type RecordCashbackOrderParams } from "@/lib/deals/cashback";

export { isTikTokUrl, cleanTikTokUrl, extractTikTokProductId };

export const DEFAULT_RIOHUB_API_BASES = [
  "https://riohub.vn/api/v1",
  "https://riohub.riokupon.com/api/v1",
  "https://riohub.riokupon.me/api/v1",
] as const;

export interface RioHubConfig {
  apiKey: string;
  creatorUsername: string;
  apiBases: string[];
  webhookSecret?: string;
}

export function getRioHubConfig(
  env: Record<string, string | undefined> = process.env
): RioHubConfig | null {
  const apiKey = (env.RIOHUB_API_KEY || "").trim();
  const creatorUsername = (env.RIOHUB_CREATOR_USERNAME || "").trim().replace(/^@/, "");
  if (!apiKey || !creatorUsername) {
    return null;
  }

  const customBase = (env.RIOHUB_API_BASE || "").trim().replace(/\/+$/, "");
  const apiBases = customBase
    ? [customBase, ...DEFAULT_RIOHUB_API_BASES.filter((b) => b !== customBase)]
    : [...DEFAULT_RIOHUB_API_BASES];

  const webhookSecret = (env.RIOHUB_WEBHOOK_SECRET || "").trim() || undefined;
  return { apiKey, creatorUsername, apiBases, webhookSecret };
}

export function isRioHubConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return getRioHubConfig(env) !== null;
}

/**
 * Verifies HMAC-SHA256 signature sent by RioHub Postback Webhook (supports raw hex or sha256=hex).
 */
export function verifyRioHubWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  const provided = signatureHeader.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex").toLowerCase();
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function callRioHubApi<T = Record<string, unknown>>(
  method: "GET" | "POST",
  apiPath: string,
  options?: {
    query?: Record<string, string | number | undefined>;
    body?: Record<string, unknown>;
    config?: RioHubConfig | null;
    fetcher?: typeof fetch;
    timeoutMs?: number;
  }
): Promise<{
  ok: boolean;
  status: number;
  errorCode?: string;
  message?: string;
  data?: T;
  raw?: unknown;
}> {
  const config = options?.config ?? getRioHubConfig();
  if (!config) {
    return {
      ok: false,
      status: 503,
      errorCode: "riohub_not_configured",
      message: "Chưa cấu hình RIOHUB_API_KEY / RIOHUB_CREATOR_USERNAME trên máy chủ.",
    };
  }

  const fetcher = options?.fetcher ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 9000;
  const normalizedPath = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;

  let queryString = "";
  if (options?.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null && String(v) !== "") {
        qs.set(k, String(v));
      }
    }
    const built = qs.toString();
    if (built) queryString = `?${built}`;
  }

  let lastFailure: {
    status: number;
    errorCode?: string;
    message?: string;
    raw?: unknown;
  } = {
    status: 502,
    errorCode: "network_error",
    message: "Không thể kết nối tới RioHub API.",
  };

  for (const base of config.apiBases) {
    const url = `${base}${normalizedPath}${queryString}`;
    try {
      const res = await fetcher(url, {
        method,
        headers: {
          "X-Riohub-Api-Key": config.apiKey,
          Accept: "application/json",
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        body: method === "POST" ? JSON.stringify(options?.body ?? {}) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });

      const raw = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.ok && raw && !raw.error) {
        return {
          ok: true,
          status: res.status,
          data: raw as T,
          raw,
        };
      }

      const errObj =
        raw?.error && typeof raw.error === "object"
          ? (raw.error as Record<string, unknown>)
          : null;
      const errorCode = String(errObj?.code || raw?.code || `http_${res.status}`);
      const message = String(
        errObj?.message || raw?.message || `RioHub API lỗi HTTP ${res.status}`
      );

      // Do not fail over to mirror domains on 4xx client/business errors (e.g. product_not_promotable, forbidden)
      if (res.status >= 400 && res.status < 500) {
        return {
          ok: false,
          status: res.status,
          errorCode,
          message,
          raw,
        };
      }

      lastFailure = { status: res.status, errorCode, message, raw };
    } catch (err: unknown) {
      lastFailure = {
        status: 502,
        errorCode: "network_error",
        message: err instanceof Error ? err.message : "Lỗi kết nối RioHub API.",
      };
    }
  }

  return {
    ok: false,
    ...lastFailure,
  };
}

export interface RioHubLinkResult {
  success: boolean;
  affiliateUrl: string;
  productId?: string;
  subId?: string;
  errorCode?: string;
  message?: string;
}

type RawRioHubLinkResponse = {
  affiliate_link?: string;
  short_link?: string;
  link?: string;
  product_id?: string | number;
  sub_id?: string;
  creator_username?: string;
  data?: {
    affiliate_link?: string;
    short_link?: string;
    product_id?: string | number;
    sub_id?: string;
  };
};

/**
 * Generates an official TikTok Shop affiliate link via RioHub Partner API with per-user `sub_id`.
 * Supports full product URLs, `vt.tiktok.com` / `tiktok.com/t/...` shortlinks, or numeric `productId`.
 */
export async function generateRioHubTikTokLink(
  rawUrl: string,
  options?: {
    subId?: string;
    productId?: string;
    config?: RioHubConfig | null;
    fetcher?: typeof fetch;
  }
): Promise<RioHubLinkResult> {
  const config = options?.config ?? getRioHubConfig();
  const cleanUrl = cleanTikTokUrl(rawUrl);
  if (!config) {
    return {
      success: false,
      affiliateUrl: cleanUrl,
      errorCode: "riohub_not_configured",
      message: "Chưa cấu hình RIOHUB_API_KEY / RIOHUB_CREATOR_USERNAME trên máy chủ.",
    };
  }

  const safeSubId = formatSubIdForUser(options?.subId);
  const extractedPid = options?.productId || extractTikTokProductId(cleanUrl) || undefined;
  const payload: Record<string, unknown> = {
    creator_username: config.creatorUsername,
    sub_id: safeSubId,
    ...(extractedPid ? { product_id: extractedPid } : { product_url: cleanUrl }),
  };

  const res = await callRioHubApi<RawRioHubLinkResponse>(
    "POST",
    "/partner/tiktok/affiliate/links",
    {
      body: payload,
      config,
      fetcher: options?.fetcher,
    }
  );

  if (!res.ok || !res.data) {
    return {
      success: false,
      affiliateUrl: cleanUrl,
      errorCode: res.errorCode,
      message: res.message || "Không thể tạo link hoàn tiền TikTok Shop cho sản phẩm này.",
    };
  }

  const d = res.data;
  const nested = d.data;
  const affiliateUrl = String(
    d.affiliate_link || nested?.affiliate_link || d.short_link || nested?.short_link || d.link || ""
  ).trim();
  const productId =
    d.product_id !== undefined
      ? String(d.product_id).trim()
      : nested?.product_id !== undefined
        ? String(nested.product_id).trim()
        : extractedPid;

  if (!affiliateUrl || !affiliateUrl.startsWith("http")) {
    return {
      success: false,
      affiliateUrl: cleanUrl,
      productId,
      errorCode: "empty_affiliate_link",
      message: "RioHub không trả về link affiliate hợp lệ cho sản phẩm này.",
    };
  }

  return {
    success: true,
    affiliateUrl,
    productId,
    subId: String(d.sub_id || nested?.sub_id || safeSubId),
  };
}

export interface RioHubProductItem {
  productId: string;
  name: string;
  price: number;
  originalPrice: number;
  seller: string;
  imageUrl: string | null;
  commissionRatePercent: number;
  grossCommission: number;
  hasInventory: boolean;
  detailLink?: string;
}

type RawRioHubPrice = {
  currency?: string;
  minimum_amount?: string | number;
  maximum_amount?: string | number;
};

type RawRioHubProduct = {
  id?: string | number;
  product_id?: string | number;
  title?: string;
  main_image_url?: string;
  image_url?: string;
  detail_link?: string;
  has_inventory?: boolean;
  shop?: { name?: string };
  shop_name?: string;
  original_price?: RawRioHubPrice;
  sales_price?: RawRioHubPrice;
  commission?: {
    amount?: string | number;
    currency?: string;
    rate?: number | string;
  };
};

function parseRioHubNumeric(val: unknown): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    // Handles range strings like "20680.00 - 46089.89" by taking the conservative lower bound
    const first = val.split("-")[0]?.trim() || "";
    const cleaned = first.replace(/[^0-9.]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

/**
 * Fetches official TikTok Shop product details (price, image, shop, exact commission rate & amount)
 * from RioHub `/partner/tiktok/affiliate/products`.
 */
export async function lookupRioHubProduct(
  productId: string,
  options?: {
    config?: RioHubConfig | null;
    fetcher?: typeof fetch;
  }
): Promise<RioHubProductItem | null> {
  const config = options?.config ?? getRioHubConfig();
  const cleanPid = String(productId || "").replace(/\D/g, "");
  if (!config || !cleanPid) return null;

  const res = await callRioHubApi<{ products?: RawRioHubProduct[] }>(
    "GET",
    "/partner/tiktok/affiliate/products",
    {
      query: {
        creator_username: config.creatorUsername,
        product_id: cleanPid,
      },
      config,
      fetcher: options?.fetcher,
    }
  );

  if (!res.ok || !Array.isArray(res.data?.products) || res.data.products.length === 0) {
    return null;
  }

  const item = res.data.products[0];
  const salesMin = Math.round(parseRioHubNumeric(item.sales_price?.minimum_amount));
  const origMin = Math.round(parseRioHubNumeric(item.original_price?.minimum_amount));
  const origMax = Math.round(parseRioHubNumeric(item.original_price?.maximum_amount));
  const price = salesMin > 0 ? salesMin : origMin;
  const originalPrice = origMax > price ? origMax : origMin > price ? origMin : price;

  // TikTok Shop / RioHub returns commission.rate in basis points (e.g. 600 = 6%, 1100 = 11%)
  const rawRate = parseRioHubNumeric(item.commission?.rate);
  const commissionRatePercent =
    rawRate >= 100
      ? Number((rawRate / 100).toFixed(2))
      : rawRate > 0 && rawRate <= 1
        ? Number((rawRate * 100).toFixed(2))
        : Number(rawRate.toFixed(2));

  const parsedCommAmt = Math.round(parseRioHubNumeric(item.commission?.amount));
  const grossCommission =
    parsedCommAmt > 0
      ? parsedCommAmt
      : price > 0 && commissionRatePercent > 0
        ? Math.round((price * commissionRatePercent) / 100)
        : 0;

  return {
    productId: String(item.id ?? item.product_id ?? cleanPid),
    name: String(item.title || "").trim(),
    price,
    originalPrice,
    seller: String(item.shop?.name || item.shop_name || "TikTok Shop").trim(),
    imageUrl:
      typeof item.main_image_url === "string" && item.main_image_url.startsWith("http")
        ? item.main_image_url
        : typeof item.image_url === "string" && item.image_url.startsWith("http")
          ? item.image_url
          : null,
    commissionRatePercent,
    grossCommission,
    hasInventory: item.has_inventory !== false,
    detailLink: item.detail_link,
  };
}

export interface ResolvedRioHubProduct {
  productId?: string;
  name: string;
  price: number;
  originalPrice: number;
  imageUrl: string | null;
  seller: string;
  affiliateUrl: string;
  grossCommission: number;
  commissionRatePercent: number;
  isVerifiedPrice: boolean;
}

/**
 * Full server-side TikTok Shop resolver via RioHub Partner API:
 * 1. Calls `POST /partner/tiktok/affiliate/links` to resolve shortlinks, verify promotability, and generate tracked link.
 * 2. Calls `GET /partner/tiktok/affiliate/products` to load real VND price, image, shop name, and exact commission.
 */
export async function resolveRioHubTikTokProduct(
  rawUrl: string,
  options?: {
    subId?: string;
    config?: RioHubConfig | null;
    fetcher?: typeof fetch;
  }
): Promise<{
  ok: boolean;
  product?: ResolvedRioHubProduct;
  errorCode?: string;
  message?: string;
}> {
  const config = options?.config ?? getRioHubConfig();
  if (!config) {
    return {
      ok: false,
      errorCode: "riohub_not_configured",
      message: "TikTok Shop (RioHub) chưa được cấu hình trên máy chủ.",
    };
  }

  const linkRes = await generateRioHubTikTokLink(rawUrl, {
    subId: options?.subId,
    config,
    fetcher: options?.fetcher,
  });

  if (!linkRes.success || !linkRes.affiliateUrl) {
    return {
      ok: false,
      errorCode: linkRes.errorCode || "product_unresolved",
      message:
        linkRes.message ||
        "Sản phẩm TikTok Shop này chưa hỗ trợ hoàn tiền hoặc link không hợp lệ. Vui lòng thử sản phẩm khác.",
    };
  }

  const productId = linkRes.productId || extractTikTokProductId(rawUrl) || undefined;
  const prod = productId
    ? await lookupRioHubProduct(productId, { config, fetcher: options?.fetcher })
    : null;

  const price = prod?.price ?? 0;
  const originalPrice = prod?.originalPrice ?? price;
  const commissionRatePercent = prod?.commissionRatePercent ?? 0;
  const grossCommission =
    prod?.grossCommission ??
    (price > 0 && commissionRatePercent > 0 ? Math.round((price * commissionRatePercent) / 100) : 0);

  return {
    ok: true,
    product: {
      productId,
      name: prod?.name || "Sản phẩm TikTok Shop",
      price,
      originalPrice,
      imageUrl: prod?.imageUrl ?? null,
      seller: prod?.seller || "TikTok Shop",
      affiliateUrl: linkRes.affiliateUrl,
      grossCommission,
      commissionRatePercent,
      isVerifiedPrice: Boolean(prod && prod.price > 0),
    },
  };
}

export function parseRioHubOrderStatus(
  record: Record<string, unknown>
): "pending" | "completed" | "rejected" | null {
  const status = String(
    record.status ?? record.order_status ?? record.commission_status ?? record.settlement_status ?? ""
  )
    .trim()
    .toLowerCase();

  if (
    [
      "cancelled",
      "canceled",
      "refunded",
      "returned",
      "ineligible",
      "rejected",
      "invalid",
      "failed",
      "3",
    ].includes(status)
  ) {
    return "rejected";
  }

  if (["completed", "settled", "paid", "approved", "2"].includes(status)) {
    return "completed";
  }

  if (
    status === "" ||
    [
      "pending",
      "unpaid",
      "awaiting_shipment",
      "awaiting_collection",
      "in_transit",
      "delivered",
      "processing",
      "created",
      "confirmed",
      "0",
      "1",
    ].includes(status)
  ) {
    return "pending";
  }

  return null;
}

export function buildRioHubOrderId(record: Record<string, unknown>): string {
  const baseOrderId = String(
    record.order_id ?? record.orderId ?? record.main_order_id ?? ""
  ).trim();
  const lineId = String(
    record.line_item_id ??
      record.lineItemId ??
      record.order_line_id ??
      record.sku_id ??
      record.skuId ??
      record.product_id ??
      ""
  ).trim();

  if (baseOrderId && lineId && lineId !== baseOrderId) {
    return `${baseOrderId}-${lineId}`;
  }
  return baseOrderId || lineId;
}

export function extractRioHubSubId(record: Record<string, unknown>): string {
  const direct =
    record.sub_id ??
    record.subId ??
    record.sub_id_1 ??
    record.sub1 ??
    record.tag;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (Array.isArray(record.tags)) {
    const first = record.tags.find((t) => typeof t === "string" && t.trim());
    if (typeof first === "string") return first.trim();
  }
  if (Array.isArray(record.sub_ids)) {
    const first = record.sub_ids.find((t) => typeof t === "string" && t.trim());
    if (typeof first === "string") return first.trim();
  }
  return "";
}

function parseRioHubTimestamp(val: unknown): string | undefined {
  if (typeof val === "number" && Number.isFinite(val) && val > 0) {
    const ms = val < 1e12 ? val * 1000 : val;
    return new Date(ms).toISOString();
  }
  if (typeof val === "string" && val.trim()) {
    const raw = val.trim();
    if (/^\d{10,13}$/.test(raw)) {
      const n = Number(raw);
      return new Date(n < 1e12 ? n * 1000 : n).toISOString();
    }
    const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T") + "+07:00");
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
}

/**
 * Syncs TikTok Shop affiliate orders directly from RioHub `/partner/tiktok/affiliate/orders`.
 */
export async function syncRioHubOrders(options: {
  config?: RioHubConfig | null;
  fetcher?: typeof fetch;
  record?: typeof recordCashbackOrder;
} = {}) {
  const config = options.config ?? getRioHubConfig();
  if (!config) {
    return {
      code: 503,
      body: {
        success: false,
        status: "riohub_not_configured",
        message: "Chưa cấu hình RIOHUB_API_KEY / RIOHUB_CREATOR_USERNAME.",
        processed: 0,
        scanned: 0,
        unmatched: 0,
        failed: 0,
      },
    };
  }

  const record = options.record ?? recordCashbackOrder;
  let processed = 0;
  let scanned = 0;
  let unmatched = 0;
  let failed = 0;
  const seenIds = new Set<string>();
  const counts = () => ({
    processed,
    scanned,
    unmatched,
    failed,
    creatorUsername: config.creatorUsername,
  });

  for (let page = 1; page <= 20; page++) {
    const res = await callRioHubApi<{
      orders?: Record<string, unknown>[];
      total?: number;
      page?: number;
      page_size?: number;
    }>("GET", "/partner/tiktok/affiliate/orders", {
      query: {
        creator_username: config.creatorUsername,
        page,
        page_size: 50,
      },
      config,
      fetcher: options.fetcher,
    });

    if (!res.ok) {
      return {
        code: 502,
        body: {
          success: false,
          status: "riohub_orders_unavailable",
          message: res.message || "Không thể lấy danh sách đơn TikTok Shop từ RioHub.",
          ...counts(),
        },
      };
    }

    const list = Array.isArray(res.data?.orders) ? res.data.orders : [];
    for (const item of list) {
      scanned++;
      const orderId = buildRioHubOrderId(item);
      const subId = extractRioHubSubId(item);

      if (!orderId || !subId || subId === "dealhoan" || subId === "calc") {
        unmatched++;
        continue;
      }

      if (seenIds.has(orderId)) {
        failed++;
        continue;
      }
      seenIds.add(orderId);

      const status = parseRioHubOrderStatus(item);
      if (!status) {
        failed++;
        continue;
      }

      const rawComm =
        item.actual_commission ??
        item.estimated_commission ??
        item.commission_amount ??
        item.commission ??
        item.payout;
      if (
        rawComm === undefined ||
        rawComm === null ||
        rawComm === "" ||
        /-/.test(String(rawComm))
      ) {
        failed++;
        continue;
      }

      const commissionAmount = Math.round(parseRioHubNumeric(rawComm));
      const orderValue = Math.round(
        parseRioHubNumeric(
          item.payment_amount ??
            item.gmv ??
            item.order_amount ??
            item.order_value ??
            item.price ??
            0
        )
      );
      const productName = String(
        item.product_name ??
          item.title ??
          item.sku_name ??
          "Sản phẩm TikTok Shop mua qua DealHoàn"
      ).trim();
      const orderedAt = parseRioHubTimestamp(
        item.order_create_time ?? item.created_at ?? item.create_time ?? item.ordered_at
      );

      const params: RecordCashbackOrderParams = {
        orderId,
        subId,
        platform: "TikTok Shop",
        productName,
        orderValue,
        commissionAmount,
        status,
        orderedAt,
        note: "Đồng bộ từ RioHub TikTok Shop Affiliate API",
        actorType: "cron",
        actorId: "syncRioHubOrders",
      };

      const recRes = await record(params);
      if (recRes.success) processed++;
      else failed++;
    }

    const pageSize = Number(res.data?.page_size) || 50;
    const total = Number(res.data?.total);
    if (list.length < pageSize || (Number.isFinite(total) && page * pageSize >= total)) {
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
