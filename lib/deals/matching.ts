import type { Coupon } from "./types";

export type MatchedCoupon = {
  coupon: Coupon;
  calculatedDiscount: number;
  isApplicable: boolean;
  reason?: string;
  minSpend: number;
  tier?: "freeship" | "shopee" | "mall";
};

/**
 * Trích xuất số tiền từ text (VD: "Đơn từ 150K" -> 150000, "500K" -> 500000, "1tr" -> 1000000)
 */
export function parseAmountFromText(text: string): number {
  if (!text) return 0;
  const t = text.toLowerCase();

  // Format: "1.5tr", "2tr", "1 triệu"
  const trMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(?:tr|triệu)/);
  if (trMatch) {
    const val = parseFloat(trMatch[1].replace(",", "."));
    return Math.round(val * 1000000);
  }

  // Format: "150k", "250.000", "50k"
  const kMatch = t.match(/(\d+(?:[.,]\d+)?)\s*k/);
  if (kMatch) {
    const val = parseFloat(kMatch[1].replace(",", "."));
    return Math.round(val * 1000);
  }

  // Format: "250.000d", "250000"
  const numMatch = t.match(/(\d{1,3}(?:\.\d{3})+|\d{4,})/);
  if (numMatch) {
    return parseInt(numMatch[1].replace(/\./g, ""), 10);
  }

  return 0;
}

/**
 * Phân tích điều kiện và số tiền giảm của một Coupon
 */
export function evaluateCoupon(coupon: Coupon, price: number, isMall: boolean = false): MatchedCoupon {
  const cond = coupon.condition || "";
  const title = coupon.title || "";

  const isFreeship =
    coupon.category === "freeship" ||
    coupon.unit === "ship" ||
    Boolean(coupon.badge && coupon.badge.toLowerCase().includes("freeship")) ||
    title.toLowerCase().includes("vận chuyển") ||
    title.toLowerCase().includes("freeship");

  const isMallCoupon =
    coupon.category === "mall" ||
    coupon.platform === "Shopee Mall" ||
    Boolean(coupon.badge && coupon.badge.toLowerCase().includes("mall")) ||
    title.toLowerCase().includes("shopee mall");

  const tier: "freeship" | "mall" | "shopee" = isFreeship ? "freeship" : isMallCoupon ? "mall" : "shopee";

  // 1. Tìm đơn tối thiểu từ condition hoặc title (VD: "Đơn tối thiểu 50,000đ", "Đơn từ 150K")
  let minSpend = 0;
  const minSpendMatch =
    cond.match(/(?:[đd]ơn(?:\s+hàng)?(?:\s+hợp\s+lệ)?\s*(?:từ|tối\s+thiểu))\s*([^·,\n\+]+)/i) ||
    title.match(/(?:[đd]ơn(?:\s+hàng)?(?:\s+hợp\s+lệ)?\s*(?:từ|tối\s+thiểu))\s*([^·,\n\+]+)/i);
  if (minSpendMatch) {
    minSpend = parseAmountFromText(minSpendMatch[1]);
  }

  // 2. Tìm giá trị giảm
  let discountVal = 0;
  const pctMatch = (coupon.amount || "").match(/(\d+)\s*%/i) || title.match(/(\d+)\s*%/i);
  const capMatch =
    (coupon.amount || "").match(/tối\s+đa\s+([^·,\n\+]+)/i) ||
    title.match(/tối\s+đa\s+([^·,\n\+]+)/i) ||
    cond.match(/tối\s+đa\s+([^·,\n\+]+)/i);
  const maxCap = capMatch ? parseAmountFromText(capMatch[1]) : 0;

  if (isFreeship) {
    discountVal = maxCap > 0 ? Math.min(30000, maxCap) : 30000;
  } else if (pctMatch) {
    const pct = parseInt(pctMatch[1], 10);
    const calculated = Math.round((price * pct) / 100);
    discountVal = maxCap > 0 ? Math.min(calculated, maxCap) : calculated;
  } else {
    discountVal = parseAmountFromText(coupon.amount) || parseAmountFromText(title) || parseAmountFromText(cond);
  }

  // 3. Kiểm tra tính khả dụng
  if (minSpend > 0 && price < minSpend) {
    const diff = minSpend - price;
    return {
      coupon,
      calculatedDiscount: 0,
      isApplicable: false,
      reason: `Cần thêm ${diff.toLocaleString("vi-VN")}đ để đạt đơn tối thiểu ${minSpend.toLocaleString("vi-VN")}đ`,
      minSpend,
      tier,
    };
  }

  if (isMallCoupon && !isMall) {
    return {
      coupon,
      calculatedDiscount: 0,
      isApplicable: false,
      reason: "Chỉ áp dụng cho gian hàng Shopee Mall chính hãng",
      minSpend,
      tier: "mall",
    };
  }

  // Hợp lệ!
  const effectiveDiscount = Math.min(discountVal, price);
  return {
    coupon,
    calculatedDiscount: effectiveDiscount,
    isApplicable: true,
    reason: "Thỏa mãn điều kiện áp dụng",
    minSpend,
    tier,
  };
}

/**
 * Lọc và so khớp toàn bộ danh sách voucher cho sản phẩm
 * Trả về 100% kho voucher có thể áp dụng, sắp xếp mã giảm cao nhất lên đầu
 * Giúp người dùng có toàn bộ mã để dự phòng nếu mã tốt nhất đã hết lượt sử dụng.
 */
export function matchVouchersForProduct(
  price: number,
  platform: string = "Shopee",
  vouchers: Coupon[] = [],
): { matched: MatchedCoupon[]; bestDiscount: number } {
  const isMall = platform?.toLowerCase().includes("mall");
  const results: MatchedCoupon[] = [];
  let bestDiscount = 0;

  for (const c of vouchers) {
    const evaluated = evaluateCoupon(c, price, isMall);
    if (evaluated.isApplicable && evaluated.calculatedDiscount > bestDiscount) {
      bestDiscount = evaluated.calculatedDiscount;
    }
    results.push(evaluated);
  }

  // Sắp xếp:
  // 1. Mã dùng được ngay (isApplicable: true) lên trước, sắp xếp mức giảm cao nhất đứng đầu
  // 2. Mã chưa đủ điều kiện (isApplicable: false) xếp sau, sắp xếp theo đơn tối thiểu tăng dần
  results.sort((a, b) => {
    if (a.isApplicable !== b.isApplicable) {
      return a.isApplicable ? -1 : 1;
    }
    if (a.isApplicable && b.isApplicable) {
      return b.calculatedDiscount - a.calculatedDiscount;
    }
    return a.minSpend - b.minSpend;
  });

  return { matched: results, bestDiscount };
}
