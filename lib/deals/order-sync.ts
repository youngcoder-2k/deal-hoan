import { recordCashbackOrder, type RecordCashbackOrderParams } from "./cashback";
import { parseShopeeMoney } from "./shopee-import";
import { loadOrderSyncConfig } from "./order-sync-config";

/** Reuse only the Shopee Affiliate cookies from the server's existing Shopee session. */
export function getOrderSyncCookie(configCookie = "", env = process.env, now = Date.now()): string {
  if (configCookie.trim()) return configCookie.trim();
  if (env.SHOPEE_AFFILIATE_COOKIE?.trim()) return env.SHOPEE_AFFILIATE_COOKIE.trim();
  if (!env.SHOPEE_STORAGE_STATE) return "";
  try {
    const state = JSON.parse(env.SHOPEE_STORAGE_STATE);
    if (!Array.isArray(state?.cookies)) return "";
    return state.cookies.filter((cookie: {name?: string;value?: string;domain?: string;expires?: number}) =>
      [".shopee.vn", ".affiliate.shopee.vn", "affiliate.shopee.vn"].includes(cookie.domain || "") &&
      /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(cookie.name || "") &&
      typeof cookie.value === "string" && !/[\r\n;]/.test(cookie.value) &&
      (cookie.expires === -1 || (typeof cookie.expires === "number" && cookie.expires * 1000 > now))
    ).map((cookie: {name: string;value: string}) => `${cookie.name}=${cookie.value}`).join("; ");
  } catch { return ""; }
}

export async function syncShopeeOrders(options: {
  cookie?: string; fetcher?: typeof fetch; record?: typeof recordCashbackOrder; now?: number;
} = {}) {
  const config = await loadOrderSyncConfig();
  if (!config.autoSyncEnabled) return { code: 409, body: { success: false, status: "sync_disabled", message: "Đồng bộ đơn đang tắt." } };
  const cookie = getOrderSyncCookie(options.cookie || config.shopeeCookie);
  if (!cookie) return { code: 503, body: { success: false, status: "shopee_session_missing", message: "Chưa có phiên Shopee Affiliate để lấy đơn. Cần cấu hình SHOPEE_AFFILIATE_COOKIE hoặc SHOPEE_STORAGE_STATE trên máy chủ." } };
  const fetcher = options.fetcher || fetch;
  const record = options.record || recordCashbackOrder;
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  let processed = 0, scanned = 0, unmatched = 0, failed = 0;
  const seen = new Set<string>();
  const counts = () => ({ processed, scanned, unmatched, failed });
  for (let page = 1; page <= 20; page++) {
    const url = new URL("https://affiliate.shopee.vn/api/v3/conversion_report");
    url.search = new URLSearchParams({ start_time: String(now - 30 * 86400), end_time: String(now), page: String(page), limit: "50" }).toString();
    let response: Response;
    try {
      response = await fetcher(url, { headers: { Cookie: cookie, Accept: "application/json", Referer: "https://affiliate.shopee.vn/report/conversion" },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(9000) });
    } catch { return { code: 502, body: { success: false, status: "shopee_source_unavailable", ...counts() } }; }
    const report = await response.json().catch(() => null);
    if (!response.ok || !report || (report.code !== undefined && report.code !== 0) || !Array.isArray(report.data?.list)) {
      return { code: 502, body: { success: false, status: "shopee_report_unavailable", upstreamStatus: response.status, ...counts() } };
    }
    const list = report.data.list as Record<string, unknown>[];
    for (const item of list) {
      scanned++;
      const orderId = String(item.order_sn ?? item.order_id ?? "").trim();
      const subId = String(item.sub_id ?? item.sub1 ?? item.sub_1 ?? "").trim();
      if (!orderId || !subId || subId === "dealhoan" || subId === "calc") { unmatched++; continue; }
      // Never silently replace an order's commission with one item of a split report.
      if (seen.has(orderId)) { failed++; continue; }
      seen.add(orderId);
      const rawStatus = String(item.status ?? "pending").toLowerCase();
      const commissionStatus = String(item.commission_status ?? item.validation_status ?? "").toLowerCase();
      // A delivered/completed shopping order is NOT confirmation of affiliate payout.
      const status = ["approved", "confirmed", "paid", "completed"].includes(commissionStatus) ? "completed"
        : ["rejected", "cancelled"].includes(commissionStatus) || ["3", "cancelled", "rejected"].includes(rawStatus) ? "rejected"
        : ["0", "1", "2", "pending", "unpaid", "processing", "completed", "approved"].includes(rawStatus) ? "pending" : null;
      if (!status) { failed++; continue; }
      const commission = item.commission ?? item.pub_commission;
      if (commission === undefined || commission === null || commission === "" || /-/.test(String(commission)) || !/\d/.test(String(commission))) { failed++; continue; }
      const params: RecordCashbackOrderParams = {
        orderId, subId, platform: item.order_type === "food" || item.order_type === 2 ? "ShopeeFood" : "Shopee",
        productName: String(item.item_name ?? item.product_name ?? "Sản phẩm mua qua DealHoàn"),
        orderValue: parseShopeeMoney(item.gmv ?? item.order_amount ?? 0),
        commissionAmount: parseShopeeMoney(commission), status,
        orderedAt: Number.isFinite(Number(item.create_time)) && Number(item.create_time)>0 ? new Date(Number(item.create_time)*1000).toISOString() : undefined,
        note: "Đồng bộ từ báo cáo chuyển đổi Shopee Affiliate",
      };
      const result = await record(params);
      if (result.success) processed++; else failed++;
    }
    const totalValue = report.data.total ?? report.data.total_count;
    const total = totalValue === undefined || totalValue === null ? NaN : Number(totalValue);
    const more = report.data.has_more;
    if (more === false || (Number.isFinite(total) && total >= 0 && page * 50 >= total) || (more !== true && list.length < 50)) {
      return { code: failed ? 502 : 200, body: { success: failed === 0, status: failed ? "partial_failure" : "synced", ...counts() } };
    }
  }
  return { code: 502, body: { success: false, status: "pagination_limit", ...counts() } };
}
