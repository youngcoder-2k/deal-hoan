import { parseUserIdFromSubId } from "./affiliate";
import { DEFAULT_BOOSTER_SETTINGS } from "./cashback-booster-types";

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
 * Parses raw CSV / TSV text into string matrix handling quoted tokens with commas
 */
export function parseCsvRows(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Detect delimiter from first non-empty line
  const firstLine = lines[0];
  let delimiter = ",";
  if (firstLine.includes("\t")) {
    delimiter = "\t";
  } else if (firstLine.includes(";") && !firstLine.includes(",")) {
    delimiter = ";";
  }

  const rows: string[][] = [];

  for (const line of lines) {
    const row: string[] = [];
    let inQuotes = false;
    let currentToken = "";

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          currentToken += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(currentToken.trim());
        currentToken = "";
      } else {
        currentToken += char;
      }
    }
    row.push(currentToken.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Parses dates from Shopee CSV formats (DD-MM-YYYY, YYYY-MM-DD, ISO, etc.)
 */
export function parseShopeeDate(val: unknown): Date | null {
  if (!val) return null;
  const str = String(val).trim();
  if (!str) return null;

  // DD-MM-YYYY or DD/MM/YYYY with optional time
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const second = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, minute, second);
    if (!isNaN(d.getTime())) return d;
  }

  // Standard Date parse (supports YYYY-MM-DD, ISO strings)
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

  headers.forEach((h, idx) => {
    // Order ID
    if (
      h.includes("order id") ||
      h.includes("mã đơn") ||
      h.includes("order_sn") ||
      h.includes("order sn") ||
      h.includes("ordersn") ||
      h.includes("mã giao dịch")
    ) {
      if (!("orderId" in headerMap)) headerMap.orderId = idx;
    }

    // Sub ID
    if (
      h.includes("sub_id") ||
      h.includes("sub id") ||
      h.includes("sub1") ||
      h.includes("sub 1") ||
      h.includes("id phụ") ||
      h.includes("sub id 1") ||
      h.includes("sub-id") ||
      h.includes("user")
    ) {
      if (!("subId" in headerMap)) headerMap.subId = idx;
    }

    // Product name
    if (
      h.includes("tên sản phẩm") ||
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

    // Order time
    if (
      h.includes("thời gian") ||
      h.includes("ngày đặt") ||
      h.includes("order time") ||
      h.includes("purchase time") ||
      h.includes("created")
    ) {
      if (!("orderedAt" in headerMap)) headerMap.orderedAt = idx;
    }
  });

  const userPercent = typeof options?.userCashbackPercent === "number" && !isNaN(options.userCashbackPercent)
    ? options.userCashbackPercent
    : (100 - (options?.safetyMarginPercent ?? DEFAULT_BOOSTER_SETTINGS.safetyMarginPercent));
  const safeMultiplier = Math.max(0.5, Math.min(0.98, userPercent / 100));

  const validOrders: ParsedShopeeOrder[] = [];
  const unmatchedOrders: ParsedShopeeOrder[] = [];
  let totalCommission = 0;
  let totalNetCommission = 0;
  let totalCashback = 0;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0 || row.every((c) => !c.trim())) continue;

    const rawOrderId = headerMap.orderId !== undefined ? row[headerMap.orderId] : row[0];
    const rawSubId = headerMap.subId !== undefined ? row[headerMap.subId] : "";
    const rawProductName = headerMap.productName !== undefined ? row[headerMap.productName] : "Sản phẩm Shopee";
    const rawOrderValue = headerMap.orderValue !== undefined ? row[headerMap.orderValue] : 0;
    const rawStatus = headerMap.status !== undefined ? row[headerMap.status] : "pending";
    const rawCommissionStatus = headerMap.commissionStatus !== undefined ? row[headerMap.commissionStatus] : "";
    const rawCompletedAt = headerMap.completedAt !== undefined ? row[headerMap.completedAt] : "";
    const rawOrderedAt = headerMap.orderedAt !== undefined ? row[headerMap.orderedAt] : "";

    const orderId = String(rawOrderId || "").trim();
    if (!orderId || orderId.length < 3) continue;

    const subId = String(rawSubId || "").trim();
    const orderValue = parseShopeeMoney(rawOrderValue);

    // Ưu tiên: tổng hoa hồng > (hoa hồng sản phẩm + hoa hồng đơn hàng) > hoa hồng chung
    const totalComm = headerMap.totalCommission !== undefined ? parseShopeeMoney(row[headerMap.totalCommission]) : 0;
    const prodComm = headerMap.productCommission !== undefined ? parseShopeeMoney(row[headerMap.productCommission]) : 0;
    const orderComm = headerMap.orderCommission !== undefined ? parseShopeeMoney(row[headerMap.orderCommission]) : 0;
    const anyComm = headerMap.commission !== undefined ? parseShopeeMoney(row[headerMap.commission]) : 0;

    // Ưu tiên lấy hoa hồng lớn nhất từ các cột hợp lệ (tránh 0đ từ cột trạng thái hoặc thiếu cột)
    const commissionAmount = Math.max(totalComm, prodComm + orderComm, anyComm);

    // Bóc tách thuế & phí: Shopee tự động khấu trừ 10% thuế TNCN + 1% phí dịch vụ sàn (tổng 11%)
    // Hoa hồng Net thực tế Shopee chuyển khoản về STK là 89% hoa hồng gộp:
    const netCommission = Math.round(commissionAmount * 0.89);

    // Tính tiền hoàn thực tế cho khách dựa trên hoa hồng Net thực nhận (sau khi đã trừ 11% thuế & phí)
    const cashbackAmount = Math.round(netCommission * safeMultiplier);

    // Chu kỳ đối soát Shopee T+15 ngày:
    // Đơn hàng chỉ được cộng vào số dư khả dụng (completed) khi:
    // 1. Không bị từ chối/hủy.
    // 2. Và ĐÃ QUA ÍT NHẤT 15 NGÀY kể từ Thời gian hoa hồng hoàn thành (hoặc ngày đặt hàng).
    // Nếu chưa đủ 15 ngày, đơn bắt buộc ở trạng thái "pending" (Chờ duyệt / Chờ hoàn) để bảo toàn vốn.
    const HOLD_DAYS = 15;
    const HOLD_MS = HOLD_DAYS * 24 * 60 * 60 * 1000;

    const completedDate = parseShopeeDate(rawCompletedAt);
    const orderedDate = parseShopeeDate(rawOrderedAt);
    const refDate = completedDate || orderedDate;

    const hasPassedHold = refDate ? (Date.now() - refDate.getTime()) >= HOLD_MS : false;

    // Normalize status
    const lowerStatus = rawStatus.toLowerCase();
    const lowerCommStatus = rawCommissionStatus.toLowerCase();
    let status: "pending" | "completed" | "rejected" = "pending";
    let isHoldPeriod = false;
    let orderNote: string | undefined = undefined;

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

    if (isCommRejected) {
      status = "rejected";
      orderNote = "Shopee đã hủy hoặc từ chối hoa hồng đơn hàng này";
    } else if (isCommPending) {
      status = "pending";
      orderNote = "Shopee đang đối soát hoa hồng (Chờ đối soát)";
    } else if (isCommPaid) {
      status = "completed";
    } else if (isOrderCompleted) {
      if (hasPassedHold) {
        status = "completed";
      } else {
        // Đang trong thời gian giữ tiền đối soát 15 ngày
        status = "pending";
        isHoldPeriod = true;
        const availableDate = refDate ? new Date(refDate.getTime() + HOLD_MS) : new Date(Date.now() + HOLD_MS);
        const dayStr = String(availableDate.getDate()).padStart(2, "0");
        const monthStr = String(availableDate.getMonth() + 1).padStart(2, "0");
        const yearStr = availableDate.getFullYear();
        orderNote = `Chờ đối soát T+15 (dự kiến khả dụng: ${dayStr}/${monthStr}/${yearStr})`;
      }
    } else {
      status = "pending";
    }

    // Try parsing user id from subId
    const parsedUserId = parseUserIdFromSubId(subId);

    const parsedOrder: ParsedShopeeOrder = {
      orderId,
      subId,
      userId: parsedUserId,
      productName: rawProductName || "Sản phẩm Shopee",
      orderValue,
      commissionAmount,
      netCommission,
      cashbackAmount,
      status,
      orderedAt: rawOrderedAt || new Date().toISOString(),
      completedAt: rawCompletedAt || undefined,
      rawStatus,
      rawCommissionStatus: rawCommissionStatus || undefined,
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
