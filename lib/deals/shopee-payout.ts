export interface PayoutOrderCandidate {
  orderId: string;
  userId?: string;
  subId?: string;
  productName?: string;
  orderValue?: number;
  commissionAmount: number;
  cashbackAmount?: number;
  status: "pending" | "completed" | "rejected";
  orderedAt?: string;
  confirmedAt?: string | null;
  completedAt?: string | null;
  note?: string | null;
}

export interface PayoutUserBreakdown {
  userId: string;
  orderCount: number;
  orderIds: string[];
  grossCommission: number;
  netCommission: number;
  cashbackAmount: number;
  dealHoanProfit: number;
}

export interface PayoutReconciliationSummary {
  orders: PayoutOrderCandidate[];
  users: PayoutUserBreakdown[];
  totalGrossCommission: number;
  totalNetCommission: number;
  totalUserCashback: number;
  totalDealHoanProfit: number;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const SHOPEE_HT_REGEX = /Shopee\s*HT\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i;

/**
 * Kiểm tra ghi chú đơn hàng có đánh dấu đã được Admin duyệt/giải ngân thủ công hay chưa.
 */
export function isAdminSettledNote(note?: string | null): boolean {
  const lower = String(note || "").toLowerCase();
  return (
    lower.includes("admin") ||
    lower.includes("thủ công") ||
    lower.includes("giải ngân")
  );
}

/**
 * Chuyển mốc thời gian ISO sang chuỗi DD/MM/YYYY theo giờ Việt Nam (+07:00).
 */
export function formatVnDateShort(isoOrDate?: string | Date | null): string | null {
  if (!isoOrDate) return null;
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (isNaN(d.getTime())) return null;
  const vn = new Date(d.getTime() + VN_OFFSET_MS);
  const dd = String(vn.getUTCDate()).padStart(2, "0");
  const mm = String(vn.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = vn.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Chuyển mốc thời gian ISO sang YYYY-MM-DD (giờ Việt Nam +07:00) để lọc theo input[type=date].
 */
export function toVnDateKey(isoOrDate?: string | Date | null): string | null {
  if (!isoOrDate) return null;
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (isNaN(d.getTime())) return null;
  const vn = new Date(d.getTime() + VN_OFFSET_MS);
  const yyyy = vn.getUTCFullYear();
  const mm = String(vn.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(vn.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Rút trích ngày hoàn thành trên Shopee (YYYY-MM-DD, +07:00) từ `completedAt`, `confirmedAt` hoặc tag `Shopee HT DD/MM/YYYY` trong ghi chú.
 */
export function extractShopeeCompletedDateKey(order: {
  completedAt?: string | null;
  confirmedAt?: string | null;
  confirmed_at?: string | null;
  note?: string | null;
}): string | null {
  const noteMatch = String(order.note || "").match(SHOPEE_HT_REGEX);
  if (noteMatch) {
    return `${noteMatch[3]}-${noteMatch[2]}-${noteMatch[1]}`;
  }
  const direct = order.completedAt || order.confirmedAt || order.confirmed_at;
  if (direct) {
    return toVnDateKey(direct);
  }
  return null;
}

/**
 * Rút trích tag hiển thị `DD/MM/YYYY` ngày Shopee hoàn thành đơn (nếu có).
 */
export function extractShopeeCompletedLabel(order: {
  completedAt?: string | null;
  confirmedAt?: string | null;
  confirmed_at?: string | null;
  note?: string | null;
}): string | null {
  const key = extractShopeeCompletedDateKey(order);
  if (!key) return null;
  const [yyyy, mm, dd] = key.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Giữ lại tag ngày Shopee hoàn thành khi Admin cập nhật ghi chú duyệt giải ngân.
 */
export function buildAdminSettlementNote(baseNote: string, existingNote?: string | null): string {
  const cleanBase = baseNote.trim() || "Admin duyệt giải ngân Shopee";
  const match = String(existingNote || "").match(SHOPEE_HT_REGEX);
  if (!match) return cleanBase;
  const tag = `Shopee HT ${match[1]}/${match[2]}/${match[3]}`;
  if (cleanBase.toLowerCase().includes(tag.toLowerCase())) return cleanBase;
  return `${cleanBase} (${tag})`;
}

/**
 * Tính toán phân bổ tiền khả dụng cho từng user từ danh sách đơn hàng đối soát giải ngân.
 */
export function reconcilePayoutOrders(
  orders: PayoutOrderCandidate[],
  options: {
    userCashbackPercent?: number;
    fromDate?: string;
    toDate?: string;
    dateField?: "completedAt" | "orderedAt";
    onlyPending?: boolean;
  } = {}
): PayoutReconciliationSummary {
  const userPercent = (options.userCashbackPercent ?? 88) / 100;
  const dateField = options.dateField ?? "completedAt";
  const fromDate = options.fromDate?.trim() || "";
  const toDate = options.toDate?.trim() || "";
  const onlyPending = options.onlyPending ?? true;

  const matchedOrders: PayoutOrderCandidate[] = [];
  const byUser = new Map<string, PayoutUserBreakdown>();

  let totalGrossCommission = 0;
  let totalNetCommission = 0;
  let totalUserCashback = 0;

  for (const ord of orders) {
    if (onlyPending && ord.status !== "pending") continue;
    if (ord.status === "rejected") continue;

    if (fromDate || toDate) {
      const dateKey =
        dateField === "completedAt"
          ? extractShopeeCompletedDateKey(ord)
          : toVnDateKey(ord.orderedAt);
      if (!dateKey) continue;
      if (fromDate && dateKey < fromDate) continue;
      if (toDate && dateKey > toDate) continue;
    }

    const comm = Math.round(Number(ord.commissionAmount) || 0);
    const netComm = Math.round(comm * 0.89);
    const cashback = Math.round(netComm * userPercent);
    const profit = Math.max(0, netComm - cashback);

    matchedOrders.push(ord);
    totalGrossCommission += comm;
    totalNetCommission += netComm;
    totalUserCashback += cashback;

    const uid = String(ord.userId || ord.subId || "unknown");
    const existing = byUser.get(uid);
    if (existing) {
      existing.orderCount += 1;
      existing.orderIds.push(ord.orderId);
      existing.grossCommission += comm;
      existing.netCommission += netComm;
      existing.cashbackAmount += cashback;
      existing.dealHoanProfit += profit;
    } else {
      byUser.set(uid, {
        userId: uid,
        orderCount: 1,
        orderIds: [ord.orderId],
        grossCommission: comm,
        netCommission: netComm,
        cashbackAmount: cashback,
        dealHoanProfit: profit,
      });
    }
  }

  const users = Array.from(byUser.values()).sort((a, b) => b.cashbackAmount - a.cashbackAmount);
  const totalDealHoanProfit = Math.max(0, totalNetCommission - totalUserCashback);

  return {
    orders: matchedOrders,
    users,
    totalGrossCommission,
    totalNetCommission,
    totalUserCashback,
    totalDealHoanProfit,
  };
}
