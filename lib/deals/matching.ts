import type { Coupon } from "./types";

export type MatchedCoupon = {
  coupon: Coupon;
  calculatedDiscount: number;
  isApplicable: boolean;
  reason?: string;
  minSpend: number;
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

  // 1. Tìm đơn tối thiểu từ condition (VD: "Đơn từ 150K", "đơn từ 500K")
  let minSpend = 0;
  const minSpendMatch = cond.match(/[đd]ơn\s+từ\s+([^·,]+)/i);
  if (minSpendMatch) {
    minSpend = parseAmountFromText(minSpendMatch[1]);
  }

  // 2. Tìm giá trị giảm
  let discountVal = parseAmountFromText(coupon.amount);
  if (discountVal === 0) {
    discountVal = parseAmountFromText(coupon.title) || parseAmountFromText(cond);
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
    };
  }

  if (coupon.category === "mall" || coupon.platform === "Shopee Mall") {
    if (!isMall) {
      return {
        coupon,
        calculatedDiscount: 0,
        isApplicable: false,
        reason: "Chỉ áp dụng cho gian hàng Shopee Mall chính hãng",
        minSpend,
      };
    }
  }

  // Hợp lệ!
  const effectiveDiscount = Math.min(discountVal, price);
  return {
    coupon,
    calculatedDiscount: effectiveDiscount,
    isApplicable: true,
    reason: "Thỏa mãn điều kiện áp dụng",
    minSpend,
  };
}

/**
 * Lọc và so khớp danh sách voucher tối ưu nhất cho sản phẩm
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

  // Sắp xếp: Mã dùng được lên trước, mã giảm nhiều nhất đứng đầu
  results.sort((a, b) => {
    if (a.isApplicable !== b.isApplicable) {
      return a.isApplicable ? -1 : 1;
    }
    return b.calculatedDiscount - a.calculatedDiscount;
  });

  return { matched: results, bestDiscount };
}
