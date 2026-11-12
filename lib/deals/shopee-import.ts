import { parseUserIdFromSubId } from "./affiliate";
import { DEFAULT_BOOSTER_SETTINGS } from "./cashback-booster-types";
import { formatVnDateShort } from "./shopee-payout";

export interface ParsedShopeeOrder {
  orderId: string;
  subId: string;
  userId?: string | null;
  productName: string;
  orderValue: number;
  commissionAmount: number;
  netCommission?: number;
  cashbackAmount: number;
  status: "pending" | "completed" | "rejected";
  orderedAt: string;
  completedAt?: string;
  rawStatus: string;
  rawCommissionStatus?: string;
  isHoldPeriod?: boolean;
  note?: string;
}

export interface ParseReportResult {
  totalRows: number;
  validOrders: ParsedShopeeOrder[];
  unmatchedOrders: ParsedShopeeOrder[];
  totalCommission: number;
  totalNetCommission: number;
  totalCashback: number;
  headersDetected: Record<string, string>;
  warnings: string[];
}

/**
 * Identifies synthetic demo/test orders so real Shopee products containing
 * substrings like "test" (e.g. "mẫu test", "que test") are never accidentally hidden.
 */
export function isSyntheticTestOrder(order: {
  orderId?: unknown;
  order_id?: unknown;
  productName?: unknown;
  product_name?: unknown;
  note?: unknown;
}): boolean {
  const id = String(order.orderId ?? order.order_id ?? "").trim();
  const name = String(order.productName ?? order.product_name ?? "").trim().toLowerCase();
  const note = String(order.note ?? "").trim().toLowerCase();
  if (!id || id.startsWith("SP_") || id.startsWith("TT_") || id.startsWith("TEST_")) return true;
  if (name === "đơn hàng thử nghiệm dealhoàn" || name === "sản phẩm test") return true;
  if (note === "đơn test do admin tạo") return true;
  return false;
}

/**
 * Parses numeric currency strings from Shopee CSV (e.g. "250.000", "250,000", "250000 ₫", "25.50")
 */
export function parseShopeeMoney(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.max(0, raw) : 0;
  if (!raw) return 0;
  let str = String(raw).trim();
  // Strip currency symbols and letters
  str = str.replace(/[₫đVNDvndUSD$]/g, "").trim();
  if (!str) return 0;

  // If format is Vietnamese dot separator: 250.000 or 1.250.000 or 41.698,00
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    str = str.replace(/\./g, "").replace(",", ".");
    return Math.max(0, Math.round(parseFloat(str) || 0));
  }

  // If format is comma separator: 250,000 or 1,250,000 or 41,698.00
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) {
    str = str.replace(/,/g, "");
    return Math.max(0, Math.round(parseFloat(str) || 0));
  }

  // If format is plain integer with comma decimal (e.g. "41698,00" or "41698,0000" or "0,00")
  if (/^\d+,\d+$/.test(str)) {
    str = str.replace(",", ".");
    return Math.max(0, Math.round(parseFloat(str) || 0));
  }

  // Otherwise clean all non-digits except dot
  const clean = str.replace(/[^\d.]/g, "");
  const num = parseFloat(clean);
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : 0;
}

/**
 * Parses raw CSV / TSV text into string matrix handling quoted tokens with commas and newlines
 */
export function parseCsvRows(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "");
  const nonEmptyLines = normalized.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length === 0) return [];

  // Detect delimiter from first header-like line
  const sampleLine = nonEmptyLines.slice(0, 5).find((l) => l.includes("\t") || l.includes(";") || l.includes(",")) || nonEmptyLines[0];
  let delimiter = ",";
  if (sampleLine.includes("\t")) {
    delimiter = "\t";
  } else if (sampleLine.includes(";") && !sampleLine.includes(",")) {
    delimiter = ";";
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let currentToken = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        currentToken += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(currentToken.trim());
      currentToken = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && normalized[i + 1] === "\n") i++;
      row.push(currentToken.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      currentToken = "";
    } else {
      currentToken += char;
    }
  }

  row.push(currentToken.trim());
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }

  return rows;
}

/**
 * Parses dates from Shopee CSV formats (DD-MM-YYYY, YYYY-MM-DD, ISO, etc.)
 * Shopee Vietnam CSV timestamps do not include timezone suffixes and are in Vietnam time (+07:00).
 * Normalize naive timestamps to +07:00 so Vercel UTC servers and PostgreSQL store the exact VN time.
 */
export function parseShopeeDate(val: unknown): Date | null {
  if (!val) return null;
  const str = String(val).trim();
  if (!str) return null;

  const hasExplicitTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(str);
  const pad2 = (n: number) => String(n).padStart(2, "0");

  // DD-MM-YYYY or DD/MM/YYYY with optional time
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const second = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const iso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}+07:00`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // YYYY-MM-DD or YYYY/MM/DD without timezone
  const ymdMatch = !hasExplicitTz
    ? str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
    : null;
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    const hour = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 0;
    const minute = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    const second = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const iso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}+07:00`;
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Standard Date parse (supports ISO strings with explicit timezone)
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  return null;
}

/**
 * Automatically parses a Shopee Affiliate Conversion Report (CSV, TSV, or plain text)
 */
export function parseShopeeConversionReport(
  csvContent: string,
  options?: { safetyMarginPercent?: number; userCashbackPercent?: number }
): ParseReportResult {
  const warnings: string[] = [];
  const rows = parseCsvRows(csvContent);

  if (rows.length < 2) {
    return {
      totalRows: 0,
      validOrders: [],
      unmatchedOrders: [],
      totalCommission: 0,
      totalNetCommission: 0,
      totalCashback: 0,
      headersDetected: {},
      warnings: ["File rỗng hoặc không có dữ liệu hàng."],
    };
  }

  // Locate the header row by searching for order / sub / commission keywords
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const rowStr = rows[i].map((c) => c.toLowerCase()).join(" ");
    if (
      (rowStr.includes("order") || rowStr.includes("đơn") || rowStr.includes("giao dịch")) &&
      (rowStr.includes("sub") || rowStr.includes("hoa hồng") || rowStr.includes("commission") || rowStr.includes("giá"))
    ) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    headerRowIndex = 0; // Default to first row
  }

  const headers = rows[headerRowIndex].map((h) => h.toLowerCase().trim());
  const headerMap: Record<string, number> = {};
  const subIdColumns: number[] = [];
  const fallbackUserColumns: number[] = [];

  headers.forEach((h, idx) => {
    // Order ID
    if (
      h.includes("order id") ||
      h.includes("mã đơn") ||
      h.includes("id đơn hàng") ||
      h.includes("order_sn") ||
      h.includes("order sn") ||
      h.includes("ordersn") ||
      h.includes("mã giao dịch")
    ) {
      if (!("orderId" in headerMap)) headerMap.orderId = idx;
    }

    // Sub ID (thu thập tất cả cột Sub_id1..5 / id phụ; tránh lấy nhầm cột User Type / New User)
    if (
      h.includes("sub_id") ||
      h.includes("sub id") ||
      h.includes("sub-id") ||
      h.includes("subid") ||
      /\bsub\s*[1-5]\b/.test(h) ||
      h.includes("id phụ")
    ) {
      subIdColumns.push(idx);
      if (!("subId" in headerMap)) headerMap.subId = idx;
    } else if (
      h === "user" ||
      h.includes("user id") ||
      h.includes("user_id") ||
      h === "userid"
    ) {
      fallbackUserColumns.push(idx);
    }

    // Product code / Item ID (giúp phân biệt các sản phẩm khác nhau trong cùng một đơn hàng)
    if (
      h.includes("mã sản phẩm") ||
      h.includes("id sản phẩm") ||
      h.includes("item id") ||
      h.includes("product id")
    ) {
      if (!("productCode" in headerMap)) headerMap.productCode = idx;
    }

    // Product name
    if (
      h.includes("tên sản phẩm") ||
      h.includes("tên item") ||
      h.includes("product name") ||
      h.includes("item name") ||
      h.includes("tên hàng") ||
      h.includes("mặt hàng")
    ) {
      if (!("productName" in headerMap)) headerMap.productName = idx;
    }

    // Order Value / GMV
    if (
      h.includes("giá trị") ||
      h.includes("tổng giá trị") ||
      h.includes("order amount") ||
      h.includes("total purchase") ||
      h.includes("gmv") ||
      h.includes("thanh toán")
    ) {
      if (!("orderValue" in headerMap)) headerMap.orderValue = idx;
    }

    // Commission (Loại bỏ các cột trạng thái/tỷ lệ để tránh lấy nhầm 0đ)
    const isExcludedComm =
      h.includes("trạng thái") ||
      h.includes("tình trạng") ||
      h.includes("status") ||
      h.includes("tỷ lệ") ||
      h.includes("rate") ||
      h.includes("%") ||
      h.includes("loại") ||
      h.includes("type") ||
      h.includes("chính sách");

    if (!isExcludedComm) {
      if (
        h.includes("tổng hoa hồng đơn") ||
        h.includes("total order commission") ||
        h.includes("order total commission")
      ) {
        headerMap.orderTotalCommission = idx;
      } else if (
        h.includes("tổng hoa hồng") ||
        h.includes("total commission") ||
        h.includes("hoa hồng thực nhận") ||
        h.includes("hoa hồng ước tính") ||
        h.includes("estimated commission") ||
        h.includes("pub_commission") ||
        h.includes("pub commission")
      ) {
        if (!("totalCommission" in headerMap)) headerMap.totalCommission = idx;
      } else if (
        h.includes("hoa hồng sản phẩm") ||
        h.includes("product commission") ||
        h.includes("item commission")
      ) {
        if (!("productCommission" in headerMap)) headerMap.productCommission = idx;
      } else if (
        h.includes("hoa hồng đơn hàng") ||
        h.includes("order commission")
      ) {
        if (!("orderCommission" in headerMap)) headerMap.orderCommission = idx;
      } else if (
        h.includes("hoa hồng") ||
        h.includes("thù lao") ||
        h.includes("commission") ||
        h.includes("thu nhập")
      ) {
        if (!("commission" in headerMap)) headerMap.commission = idx;
      }
    }

    // Trạng thái hoa hồng / Commission status
    if (
      h.includes("trạng thái hoa hồng") ||
      h.includes("tình trạng hoa hồng") ||
      h.includes("commission status") ||
      h.includes("validation status") ||
      h.includes("đối soát")
    ) {
      if (!("commissionStatus" in headerMap)) headerMap.commissionStatus = idx;
    }

    // Status
    if (
      h.includes("trạng thái đơn hàng") ||
      h.includes("tình trạng đơn hàng") ||
      h.includes("order status") ||
      h.includes("trạng thái") ||
      h.includes("status") ||
      h.includes("tình trạng")
    ) {
      if (h.includes("đơn hàng") || h.includes("order") || !("status" in headerMap)) {
        headerMap.status = idx;
      }
    }

    // Thời gian hoàn thành / Thời gian hoa hồng hoàn thành
    if (
      h.includes("thời gian hoa hồng hoàn thành") ||
      h.includes("thời gian hoàn thành") ||
      h.includes("ngày hoàn thành") ||
      h.includes("complete time") ||
      h.includes("completion time") ||
      h.includes("commission complete time")
    ) {
      if (!("completedAt" in headerMap)) headerMap.completedAt = idx;
    }

    // Order time (ưu tiên cột thời gian đặt hàng, tránh lấy nhầm Thời gian Click hoặc Thời gian hoàn thành)
    if (
      h.includes("thời gian đặt hàng") ||
      h.includes("ngày đặt") ||
      h.includes("order time") ||
      h.includes("purchase time")
    ) {
      headerMap.orderedAt = idx;
    } else if (
      (h.includes("thời gian") || h.includes("created")) &&
      !h.includes("hoàn thành") &&
      !h.includes("complete") &&
      !h.includes("click")
    ) {
      if (!("orderedAt" in headerMap)) headerMap.orderedAt = idx;
    } else if (h.includes("thời gian") && !("fallbackTime" in headerMap)) {
      headerMap.fallbackTime = idx;
    }
  });

  if (!("orderedAt" in headerMap) && "fallbackTime" in headerMap) {
    headerMap.orderedAt = headerMap.fallbackTime;
  }
  const allSubIdCandidates = [...subIdColumns, ...fallbackUserColumns];
  if (!("subId" in headerMap) && allSubIdCandidates.length > 0) {
    headerMap.subId = allSubIdCandidates[0];
  }

  const userPercent = typeof options?.userCashbackPercent === "number" && !isNaN(options.userCashbackPercent)
    ? options.userCashbackPercent
    : (100 - (options?.safetyMarginPercent ?? DEFAULT_BOOSTER_SETTINGS.safetyMarginPercent));
  const safeMultiplier = Math.max(0.5, Math.min(0.98, userPercent / 100));

  interface RawOrderRow {
    orderId: string;
    subId: string;
    userId: string | null;
    productCode: string;
    productName: string;
    orderValue: number;
    orderTotalComm: number;
    itemComm: number;
    rawStatus: string;
    rawCommissionStatus: string;
    rawCompletedAt: string;
    rawOrderedAt: string;
    completedDate: Date | null;
    orderedDate: Date | null;
    isCommPending: boolean;
    isCommRejected: boolean;
    isOrderCompleted: boolean;
    isCommPaid: boolean;
  }

  const orderGroups = new Map<string, RawOrderRow[]>();

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0 || row.every((c) => !c.trim())) continue;

    const rawOrderId = headerMap.orderId !== undefined ? row[headerMap.orderId] : row[0];
    const rawSubId = headerMap.subId !== undefined ? row[headerMap.subId] : "";
    const rawProductCode = headerMap.productCode !== undefined ? String(row[headerMap.productCode] || "").trim() : "";
    const rawProductName = headerMap.productName !== undefined ? row[headerMap.productName] : "Sản phẩm Shopee";
    const rawOrderValue = headerMap.orderValue !== undefined ? row[headerMap.orderValue] : 0;
    const rawStatus = headerMap.status !== undefined ? row[headerMap.status] : "pending";
    const rawCommissionStatus = headerMap.commissionStatus !== undefined ? row[headerMap.commissionStatus] : "";
    const rawCompletedAt = headerMap.completedAt !== undefined ? row[headerMap.completedAt] : "";
    const rawOrderedAt = headerMap.orderedAt !== undefined ? row[headerMap.orderedAt] : "";

    const orderId = String(rawOrderId || "").trim();
    if (!orderId || orderId.length < 3) continue;

    let subId = String(rawSubId || "").trim();
    let parsedUserId = parseUserIdFromSubId(subId);
    if (!parsedUserId && allSubIdCandidates.length > 1) {
      for (const colIdx of allSubIdCandidates) {
        const candidate = String(row[colIdx] || "").trim();
        const candidateUserId = parseUserIdFromSubId(candidate);
        if (candidateUserId) {
          subId = candidate;
          parsedUserId = candidateUserId;
          break;
        }
      }
    }
    const orderValue = parseShopeeMoney(rawOrderValue);

    const orderTotalComm = headerMap.orderTotalCommission !== undefined ? parseShopeeMoney(row[headerMap.orderTotalCommission]) : 0;
    const totalComm = headerMap.totalCommission !== undefined ? parseShopeeMoney(row[headerMap.totalCommission]) : 0;
    const prodComm = headerMap.productCommission !== undefined ? parseShopeeMoney(row[headerMap.productCommission]) : 0;
    const orderComm = headerMap.orderCommission !== undefined ? parseShopeeMoney(row[headerMap.orderCommission]) : 0;
    const anyComm = headerMap.commission !== undefined ? parseShopeeMoney(row[headerMap.commission]) : 0;

    const itemComm = Math.max(totalComm, prodComm + orderComm, anyComm);

    const lowerStatus = rawStatus.toLowerCase();
    const lowerCommStatus = rawCommissionStatus.toLowerCase();

    const isCommPending =
      lowerCommStatus.includes("chờ") ||
      lowerCommStatus.includes("đối soát") ||
      lowerCommStatus.includes("pending") ||
      lowerCommStatus.includes("processing") ||
      lowerCommStatus.includes("unpaid");

    const isCommRejected =
      lowerStatus.includes("hủy") ||
      lowerStatus.includes("huỷ") ||
      lowerStatus.includes("thất bại") ||
      lowerStatus.includes("cancelled") ||
      lowerStatus.includes("rejected") ||
      lowerStatus === "3" ||
      lowerCommStatus.includes("hủy") ||
      lowerCommStatus.includes("huỷ") ||
      lowerCommStatus.includes("từ chối") ||
      lowerCommStatus.includes("rejected");

    const isOrderCompleted =
      lowerStatus.includes("hoàn thành") ||
      lowerStatus.includes("thành công") ||
      lowerStatus.includes("completed") ||
      lowerStatus.includes("success") ||
      lowerStatus.includes("approved") ||
      lowerStatus === "2";

    const isCommPaid =
      lowerCommStatus.includes("đã thanh toán") ||
      lowerCommStatus.includes("paid");

    const itemRow: RawOrderRow = {
      orderId,
      subId,
      userId: parsedUserId,
      productCode: rawProductCode,
      productName: String(rawProductName || "Sản phẩm Shopee").trim() || "Sản phẩm Shopee",
      orderValue,
      orderTotalComm,
      itemComm,
      rawStatus,
      rawCommissionStatus,
      rawCompletedAt,
      rawOrderedAt,
      completedDate: parseShopeeDate(rawCompletedAt),
      orderedDate: parseShopeeDate(rawOrderedAt),
      isCommPending,
      isCommRejected,
      isOrderCompleted,
      isCommPaid,
    };

    const existingGroup = orderGroups.get(orderId);
    if (existingGroup) {
      existingGroup.push(itemRow);
    } else {
      orderGroups.set(orderId, [itemRow]);
    }
  }

  const validOrders: ParsedShopeeOrder[] = [];
  const unmatchedOrders: ParsedShopeeOrder[] = [];
  let totalCommission = 0;
  let totalNetCommission = 0;
  let totalCashback = 0;

  const HOLD_DAYS = 15;
  const HOLD_MS = HOLD_DAYS * 24 * 60 * 60 * 1000;

  // Gộp các dòng thuộc cùng 1 Mã đơn hàng (Shopee CSV xuất 1 dòng cho mỗi sản phẩm trong đơn)
  for (const [orderId, rawItems] of orderGroups.entries()) {
    // Khử các dòng trùng lặp y hệt (tránh cộng đúp nếu admin paste/nối file trùng dòng)
    const seenRowSignatures = new Set<string>();
    const uniqueItems: RawOrderRow[] = [];
    for (const item of rawItems) {
      const sig = `${item.productCode}|${item.productName}|${item.orderValue}|${item.itemComm}|${item.orderTotalComm}`;
      if (!seenRowSignatures.has(sig)) {
        seenRowSignatures.add(sig);
        uniqueItems.push(item);
      }
    }

    const bestUserItem = uniqueItems.find((i) => i.userId) || uniqueItems.find((i) => i.subId) || uniqueItems[0];
    const subId = bestUserItem.subId;
    const parsedUserId = bestUserItem.userId;

    const maxOrderTotalComm = Math.max(0, ...uniqueItems.map((i) => i.orderTotalComm));
    const sumItemComm = uniqueItems.reduce((sum, i) => sum + i.itemComm, 0);
    // Nếu có cột "Tổng hoa hồng đơn hàng" thì ưu tiên lấy MAX trên nhóm để tránh lặp hoặc 0đ ở dòng phụ ghi đè;
    // ngược lại cộng dồn hoa hồng từng sản phẩm khác nhau trong cùng đơn hàng.
    const commissionAmount = maxOrderTotalComm > 0 ? maxOrderTotalComm : sumItemComm;

    // Tính tổng giá trị đơn hàng hợp lý (nếu đơn lặp orderTotalComm & orderValue y hệt thì không nhân N lần)
    const allSamePositiveValue =
      uniqueItems.length > 1 &&
      maxOrderTotalComm > 0 &&
      uniqueItems.every((i) => i.orderValue > 0 && i.orderValue === uniqueItems[0].orderValue);
    const orderValue = allSamePositiveValue
      ? uniqueItems[0].orderValue
      : uniqueItems.reduce((sum, i) => sum + i.orderValue, 0);

    // Chọn tên sản phẩm đại diện (ưu tiên dòng có hoa hồng cao nhất)
    const primaryItem = [...uniqueItems].sort((a, b) => (b.itemComm || b.orderTotalComm) - (a.itemComm || a.orderTotalComm))[0];
    const distinctNames = Array.from(new Set(uniqueItems.map((i) => i.productName).filter(Boolean)));
    const productName =
      distinctNames.length > 1
        ? `${primaryItem.productName} (+${distinctNames.length - 1} sp)`
        : primaryItem.productName;

    // Chuẩn hóa thời gian đặt & hoàn thành theo múi giờ Việt Nam (+07:00) -> ISO UTC
    const orderedDates = uniqueItems.map((i) => i.orderedDate).filter((d): d is Date => d !== null);
    const completedDates = uniqueItems.map((i) => i.completedDate).filter((d): d is Date => d !== null);
    const orderedDate = orderedDates.length > 0 ? new Date(Math.min(...orderedDates.map((d) => d.getTime()))) : null;
    const completedDate = completedDates.length > 0 ? new Date(Math.max(...completedDates.map((d) => d.getTime()))) : null;
    const refDate = completedDate || orderedDate;
    const hasPassedHold = refDate ? (Date.now() - refDate.getTime()) >= HOLD_MS : false;

    // Xác định trạng thái đơn tổng hợp: ưu tiên dựa trên các item phát sinh hoa hồng > 0
    const commissionedItems = uniqueItems.filter((i) => i.itemComm > 0 || i.orderTotalComm > 0);
    const statusItems = commissionedItems.length > 0 ? commissionedItems : uniqueItems;

    const allRejected = statusItems.every((i) => i.isCommRejected);
    const anyPaid = statusItems.some((i) => !i.isCommRejected && i.isCommPaid);
    const anyCommPending = statusItems.some((i) => !i.isCommRejected && i.isCommPending);
    const anyOrderCompleted = statusItems.some((i) => !i.isCommRejected && i.isOrderCompleted);

    let status: "pending" | "completed" | "rejected" = "pending";
    let isHoldPeriod = false;
    let orderNote: string | undefined = undefined;
    const completedLabel = formatVnDateShort(completedDate);
    const completedTag = completedLabel ? `Shopee HT ${completedLabel}` : "";

    if (allRejected) {
      status = "rejected";
      orderNote = "Shopee đã hủy hoặc từ chối hoa hồng đơn hàng này";
    } else if (anyCommPending) {
      status = "pending";
      orderNote = completedTag
        ? `${completedTag} · Shopee đang đối soát hoa hồng (Chờ đối soát)`
        : "Shopee đang đối soát hoa hồng (Chờ đối soát)";
    } else if (anyPaid) {
      status = "completed";
      orderNote = completedTag || undefined;
    } else if (anyOrderCompleted) {
      if (hasPassedHold) {
        status = "completed";
        orderNote = completedTag || undefined;
      } else {
        status = "pending";
        isHoldPeriod = true;
        const availableDate = refDate ? new Date(refDate.getTime() + HOLD_MS) : new Date(Date.now() + HOLD_MS);
        const availLabel = formatVnDateShort(availableDate) || "";
        const holdMsg = `Chờ đối soát T+15 (dự kiến khả dụng: ${availLabel})`;
        orderNote = completedTag ? `${completedTag} · ${holdMsg}` : holdMsg;
      }
    } else {
      status = "pending";
    }

    // Bóc tách thuế & phí: 10% TNCN + 1% phí sàn -> hoa hồng thực nhận = 89%
    const netCommission = Math.round(commissionAmount * 0.89);
    const cashbackAmount = Math.round(netCommission * safeMultiplier);

    const parsedOrder: ParsedShopeeOrder = {
      orderId,
      subId,
      userId: parsedUserId,
      productName,
      orderValue,
      commissionAmount,
      netCommission,
      cashbackAmount,
      status,
      orderedAt: orderedDate ? orderedDate.toISOString() : new Date().toISOString(),
      completedAt: completedDate ? completedDate.toISOString() : undefined,
      rawStatus: primaryItem.rawStatus,
      rawCommissionStatus: primaryItem.rawCommissionStatus || undefined,
      isHoldPeriod,
      note: orderNote,
    };

    if (parsedUserId) {
      validOrders.push(parsedOrder);
      totalCommission += commissionAmount;
      totalNetCommission += netCommission;
      totalCashback += cashbackAmount;
    } else {
      unmatchedOrders.push(parsedOrder);
    }
  }

  const detectedHeadersSummary: Record<string, string> = {};
  for (const [key, colIdx] of Object.entries(headerMap)) {
    detectedHeadersSummary[key] = headers[colIdx] || `Cột #${colIdx + 1}`;
  }

  return {
    totalRows: validOrders.length + unmatchedOrders.length,
    validOrders,
    unmatchedOrders,
    totalCommission,
    totalNetCommission,
    totalCashback,
    headersDetected: detectedHeadersSummary,
    warnings,
  };
}

/**
 * Demo sample Shopee CSV data so admin can test instantly with 1 click
 */
export const SAMPLE_SHOPEE_CSV = `Mã đơn hàng,Thời gian đặt hàng,Sub_ID,Tên sản phẩm,Giá trị đơn hàng (VND),Hoa hồng ước tính (VND),Trạng thái đơn hàng
241010SHP98124,2026-10-10 14:22,u_demo-user-123,Áo Thun Polo Nam Phối Cổ Thoáng Khí,240000,24000,Hoàn thành
241010SHP98125,2026-10-10 15:10,u_demo-user-123,Serum Dưỡng Trắng Da Mờ Thâm Niacinamide,350000,42000,Chờ xử lý
241010SHP98126,2026-10-10 16:05,u_1f162a51,Bình Giữ Nhiệt Lock&Lock 500ml Inox 316,280000,28000,Hoàn thành
241010SHP98127,2026-10-10 16:30,u_1f162a51,Tai Nghe Không Dây Bluetooth True Wireless,490000,58000,Chờ xử lý
241010SHP98128,2026-10-10 16:45,dealhoan_organic,Sạc Nhanh Anker 20W USB-C PD,210000,16800,Hoàn thành`;
