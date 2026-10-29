import type { Coupon } from "./types";

export type MatchedCoupon = {
  coupon: Coupon;
  calculatedDiscount: number;
  isApplicable: boolean;
  reason?: string;
  minSpend: number;
  tier?: "freeship" | "shopee" | "mall";
  slotLabel: string;
  slotLevel: "high" | "medium" | "low" | "empty";
  timeSlotLabel: string;
  isSlotExhausted: boolean;
};

/**
 * Trả về thông tin khung giờ vàng Shopee hiện tại và đợt mở mã kế tiếp
 */
export function getCurrentShopeeSlotInfo() {
  const vnDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const hour = vnDate.getHours();
  const minutes = vnDate.getMinutes();

  let activeSlot = "0h";
  let nextSlot = "9h";
  let nextSlotHour = 9;

  if (hour >= 21) {
    activeSlot = "21h";
    nextSlot = "0h ngày mai";
    nextSlotHour = 24;
  } else if (hour >= 18) {
    activeSlot = "18h";
    nextSlot = "21h";
    nextSlotHour = 21;
  } else if (hour >= 12) {
    activeSlot = "12h";
    nextSlot = "18h";
    nextSlotHour = 18;
  } else if (hour >= 9) {
    activeSlot = "9h";
    nextSlot = "12h";
    nextSlotHour = 12;
  } else {
    activeSlot = "0h";
    nextSlot = "9h";
    nextSlotHour = 9;
  }

  const minsUntilNext = (nextSlotHour * 60) - (hour * 60 + minutes);
  const hoursLeft = Math.floor(minsUntilNext / 60);
  const minsLeft = minsUntilNext % 60;
  const countdown = hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}p` : `${minsLeft} phút`;

  return {
    activeSlot,
    nextSlot,
    countdown,
    formattedCurrentTime: `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
  };
}

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
 * Phân tích điều kiện, tiến độ slot và số tiền giảm của một Coupon
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

  // 1. Phân tích tiến độ lượt dùng & còn slot hay không
  const usage = coupon.usagePercent ?? 50;
  let slotLabel = `Còn ~${Math.max(1, 100 - usage)}% lượt`;
  let slotLevel: "high" | "medium" | "low" | "empty" = "high";
  let isSlotExhausted = false;

  if (usage >= 98) {
    slotLabel = "Nguy cơ hết lượt (Đã dùng 98%+)";
    slotLevel = "empty";
    isSlotExhausted = true;
  } else if (usage >= 85) {
    slotLabel = `Sắp hết (Còn ~${100 - usage}% lượt)`;
    slotLevel = "low";
  } else if (usage >= 60) {
    slotLabel = `Đã dùng ${usage}%`;
    slotLevel = "medium";
  } else {
    slotLabel = `Còn ~${100 - usage}% lượt`;
    slotLevel = "high";
  }

  // 2. Phân tích khung giờ hiệu lực / bắt đầu
  const slotInfo = getCurrentShopeeSlotInfo();
  const timeSlotLabel = coupon.timeSlot || coupon.startTime || `Khung ${slotInfo.activeSlot}`;

  // 3. Tìm đơn tối thiểu từ condition hoặc title (VD: "Đơn tối thiểu 50,000đ", "Đơn từ 150K")
  let minSpend = 0;
  const minSpendMatch =
    cond.match(/(?:[đd]ơn(?:\s+hàng)?(?:\s+hợp\s+lệ)?\s*(?:từ|tối\s+thiểu))\s*([^·,\n\+]+)/i) ||
    title.match(/(?:[đd]ơn(?:\s+hàng)?(?:\s+hợp\s+lệ)?\s*(?:từ|tối\s+thiểu))\s*([^·,\n\+]+)/i);
  if (minSpendMatch) {
    minSpend = parseAmountFromText(minSpendMatch[1]);
  }

  // 4. Tìm giá trị giảm
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

  // 5. Kiểm tra tính khả dụng
  if (minSpend > 0 && price < minSpend) {
    const diff = minSpend - price;
    return {
      coupon,
      calculatedDiscount: 0,
      isApplicable: false,
      reason: `Cần thêm ${diff.toLocaleString("vi-VN")}đ để đạt đơn tối thiểu ${minSpend.toLocaleString("vi-VN")}đ`,
      minSpend,
      tier,
      slotLabel,
      slotLevel,
      timeSlotLabel,
      isSlotExhausted,
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
      slotLabel,
      slotLevel,
      timeSlotLabel,
      isSlotExhausted,
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
    slotLabel,
    slotLevel,
    timeSlotLabel,
    isSlotExhausted,
  };
}

/**
 * Lọc và so khớp toàn bộ danh sách voucher cho sản phẩm
 * Trả về 100% kho voucher có thể áp dụng, sắp xếp thông minh:
 * 1. Mã dùng được VÀ CÒN SLOT lên đầu tiên (giảm sâu nhất đứng trước)
 * 2. Mã sắp hết / nguy cơ hết slot xếp sau kèm cảnh báo
 * 3. Mã chưa đủ đơn tối thiểu xếp cuối
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

  // Sắp xếp ưu tiên an toàn cao nhất cho người dùng:
  // 1. Mã dùng được và còn slot (!isSlotExhausted) -> giảm nhiều nhất đứng đầu
  // 2. Mã dùng được nhưng đã cạn slot (isSlotExhausted) -> xếp sau
  // 3. Mã chưa đủ điều kiện -> xếp cuối
  results.sort((a, b) => {
    if (a.isApplicable !== b.isApplicable) {
      return a.isApplicable ? -1 : 1;
    }
    if (a.isApplicable && b.isApplicable) {
      if (a.isSlotExhausted !== b.isSlotExhausted) {
        return a.isSlotExhausted ? 1 : -1;
      }
      return b.calculatedDiscount - a.calculatedDiscount;
    }
    return a.minSpend - b.minSpend;
  });

  return { matched: results, bestDiscount };
}
