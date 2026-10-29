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
  isPaymentRestricted?: boolean;
};

/**
 * Kiểm tra xem mã có yêu cầu phương thức thanh toán đặc thù (SPayLater, ShopeePay, ngân hàng...) hay không.
 * Người dùng thông thường mua hàng trên app Shopee không có các tài khoản/ví này,
 * nên hệ thống ưu tiên 100% mã dùng trực tiếp trên app Shopee cho mọi phương thức thanh toán.
 */
export function isPaymentRestrictedCoupon(coupon: Coupon): boolean {
  const code = (coupon.code || "").toUpperCase().trim();
  const text = `${coupon.code} ${coupon.title || ""} ${coupon.subtitle || ""} ${coupon.condition || ""} ${coupon.badge || ""} ${coupon.url || ""}`.toLowerCase();

  // 1. Kiểm tra prefix đặc trưng của ShopeePay & SPayLater
  if (
    code.startsWith("SPL") ||      // SPayLater (vd: SPLOCT0131A, SPLSVIPTV1, SPLSVIPTV3)
    code.startsWith("SPP") ||      // ShopeePay (vd: SPPAPPSVIPDT61, SPPDPSVIPMVI61, SPPAPPSVIPHD7)
    code.startsWith("SPAY") ||     // SPayLater/ShopeePay
    code.startsWith("SHPEEPAY") ||
    code.startsWith("SHOPEEPAY") ||
    code.startsWith("AIRPAY")
  ) {
    return true;
  }

  // 2. Kiểm tra từ khóa trong nội dung và điều kiện mã
  return (
    text.includes("spaylater") ||
    text.includes("spay later") ||
    text.includes("shopeepay") ||
    text.includes("shopee pay") ||
    text.includes("ví shopeepay") ||
    text.includes("ví shopee") ||
    text.includes("airpay") ||
    text.includes("ví điện tử") ||
    text.includes("thẻ tín dụng") ||
    text.includes("ngân hàng") ||
    text.includes("thanh toán qua") ||
    text.includes("credit card")
  );
}

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
  const isPaymentRestricted = isPaymentRestrictedCoupon(coupon);

  // 1. Phân tích tiến độ lượt dùng & còn slot hay không
  const usage = coupon.usagePercent ?? 50;
  const rawSub = (coupon.subtitle || "").toLowerCase();
  const rawTitle = (coupon.title || "").toLowerCase();
  const hasExhaustedText = rawSub.includes("hết lượt") || rawTitle.includes("hết lượt");

  // Ngưỡng an toàn cao: Đã dùng từ 90% trở lên (còn < 10% slot) hoặc ghi rõ hết lượt
  // => Lập tức coi là cạn slot và ẩn đi để người dùng không bị hụt mã khi thanh toán.
  const isSlotExhausted = usage >= 90 || hasExhaustedText;

  let slotLabel = "";
  let slotLevel: "high" | "medium" | "low" | "empty" = "high";

  // Tuyệt đối không dùng ký tự '~' tránh gây hiểu nhầm thành dấu trừ '-' (âm %)
  if (isSlotExhausted) {
    slotLabel = "Đã hết lượt";
    slotLevel = "empty";
  } else if (usage >= 75) {
    const remaining = Math.max(1, 100 - usage);
    slotLabel = `Sắp hết (Còn ${remaining}% lượt)`;
    slotLevel = "low";
  } else if (usage >= 50) {
    slotLabel = `Đã dùng ${usage}%`;
    slotLevel = "medium";
  } else {
    const remaining = Math.max(1, 100 - usage);
    slotLabel = `Còn nhiều (${remaining}% lượt)`;
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
      isPaymentRestricted,
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
      isPaymentRestricted,
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
    isPaymentRestricted,
  };
}

/**
 * Lọc và so khớp toàn bộ danh sách voucher cho sản phẩm
 * Trả về 100% kho voucher có thể áp dụng:
 * 1. Ưu tiên tuyệt đối mã dùng trực tiếp trên app Shopee (loại bỏ hoàn toàn mã SPayLater / ShopeePay)
 * 2. Ẩn hoàn toàn mã cạn slot (đã dùng >= 90%)
 * 3. Sắp xếp mã dùng được lên trước (giảm nhiều nhất đứng đầu)
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
    // Loại bỏ mã yêu cầu phương thức thanh toán đặc thù (SPayLater, ShopeePay)
    if (isPaymentRestrictedCoupon(c)) {
      continue;
    }

    const evaluated = evaluateCoupon(c, price, isMall);
    // Bỏ hoàn toàn mã đã hết lượt, tuyệt đối không hiển thị lên giao diện
    if (evaluated.isSlotExhausted) {
      continue;
    }
    if (evaluated.isApplicable && evaluated.calculatedDiscount > bestDiscount) {
      bestDiscount = evaluated.calculatedDiscount;
    }
    results.push(evaluated);
  }

  // Sắp xếp ưu tiên:
  // 1. Mã dùng được ngay lên đầu (giảm nhiều nhất đứng trước)
  // 2. Mã chưa đủ đơn tối thiểu xếp cuối
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
