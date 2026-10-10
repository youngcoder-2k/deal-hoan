import { parseUserIdFromSubId } from "./affiliate";
import { DEFAULT_BOOSTER_SETTINGS } from "./cashback-booster-types";

export interface ParsedShopeeOrder {
  orderId: string;
  subId: string;
  userId?: string | null;
  productName: string;
  orderValue: number;
  commissionAmount: number;
  cashbackAmount: number;
  status: "pending" | "completed" | "rejected";
  orderedAt: string;
  rawStatus: string;
}

export interface ParseReportResult {
  totalRows: number;
  validOrders: ParsedShopeeOrder[];
  unmatchedOrders: ParsedShopeeOrder[];
  totalCommission: number;
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

  // If format is Vietnamese dot separator: 250.000 or 1.250.000
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    str = str.replace(/\./g, "").replace(",", ".");
    return Math.max(0, Math.round(parseFloat(str) || 0));
  }

  // If format is comma separator: 250,000 or 1,250,000
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(str)) {
    str = str.replace(/,/g, "");
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
 * Automatically parses a Shopee Affiliate Conversion Report (CSV, TSV, or plain text)
 */
export function parseShopeeConversionReport(
  csvContent: string,
  options?: { safetyMarginPercent?: number }
): ParseReportResult {
  const warnings: string[] = [];
  const rows = parseCsvRows(csvContent);

  if (rows.length < 2) {
    return {
      totalRows: 0,
      validOrders: [],
      unmatchedOrders: [],
      totalCommission: 0,
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

    // Commission
    if (
      h.includes("hoa hồng") ||
      h.includes("thù lao") ||
      h.includes("commission") ||
      h.includes("pub_commission") ||
      h.includes("thu nhập")
    ) {
      if (!("commission" in headerMap)) headerMap.commission = idx;
    }

    // Status
    if (
      h.includes("trạng thái") ||
      h.includes("status") ||
      h.includes("tình trạng")
    ) {
      if (!("status" in headerMap)) headerMap.status = idx;
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

  const margin = options?.safetyMarginPercent ?? DEFAULT_BOOSTER_SETTINGS.safetyMarginPercent;
  const safeMultiplier = Math.max(0.6, (100 - margin) / 100);

  const validOrders: ParsedShopeeOrder[] = [];
  const unmatchedOrders: ParsedShopeeOrder[] = [];
  let totalCommission = 0;
  let totalCashback = 0;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0 || row.every((c) => !c.trim())) continue;

    const rawOrderId = headerMap.orderId !== undefined ? row[headerMap.orderId] : row[0];
    const rawSubId = headerMap.subId !== undefined ? row[headerMap.subId] : "";
    const rawProductName = headerMap.productName !== undefined ? row[headerMap.productName] : "Sản phẩm Shopee";
    const rawOrderValue = headerMap.orderValue !== undefined ? row[headerMap.orderValue] : 0;
    const rawCommission = headerMap.commission !== undefined ? row[headerMap.commission] : 0;
    const rawStatus = headerMap.status !== undefined ? row[headerMap.status] : "pending";
    const rawOrderedAt = headerMap.orderedAt !== undefined ? row[headerMap.orderedAt] : "";

    const orderId = String(rawOrderId || "").trim();
    if (!orderId || orderId.length < 3) continue;

    const subId = String(rawSubId || "").trim();
    const orderValue = parseShopeeMoney(rawOrderValue);
    const commissionAmount = parseShopeeMoney(rawCommission);

    // Calculate safe cashback amount with margin guardrail
    const cashbackAmount = Math.round(commissionAmount * safeMultiplier);

    // Normalize status
    const lowerStatus = rawStatus.toLowerCase();
    let status: "pending" | "completed" | "rejected" = "pending";
    if (
      lowerStatus.includes("hoàn thành") ||
      lowerStatus.includes("thành công") ||
      lowerStatus.includes("completed") ||
      lowerStatus.includes("success") ||
      lowerStatus.includes("approved") ||
      lowerStatus === "2"
    ) {
      status = "completed";
    } else if (
      lowerStatus.includes("hủy") ||
      lowerStatus.includes("huỷ") ||
      lowerStatus.includes("thất bại") ||
      lowerStatus.includes("cancelled") ||
      lowerStatus.includes("rejected") ||
      lowerStatus === "3"
    ) {
      status = "rejected";
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
      cashbackAmount,
      status,
      orderedAt: rawOrderedAt || new Date().toISOString(),
      rawStatus,
    };

    if (parsedUserId) {
      validOrders.push(parsedOrder);
      totalCommission += commissionAmount;
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
