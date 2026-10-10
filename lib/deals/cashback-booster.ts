/**
 * Smart Cashback Booster for DealHoàn
 * 
 * Áp dụng Mô hình Parabol liên tục để tự động tăng % hoàn tiền cho DealHoàn
 * cao hơn đối thủ (Hoàn Ngay) nhưng luôn bảo toàn vùng lợi nhuận an toàn (Zero Loss).
 * 
 * Phương trình Parabol:
 *   ΔR(x) = 1.0 - 0.0165 · (8.0 - x)²   (với x < 8.0)
 *   ΔR(x) = 1.0                          (với x >= 8.0)
 * 
 * - Khi x thấp (1.5% - 2.5%, đồ công nghệ): ΔR ≈ +0.3% -> +0.5% (đảm bảo không bù lỗ)
 * - Khi x trung bình (4.0% - 6.0%, gia dụng): ΔR ≈ +0.7% -> +0.9%
 * - Khi x cao (>= 8.0%, thời trang/mỹ phẩm): ΔR = +1.0% (lợi thế cạnh tranh tối đa)
 */

export interface BoostedCashbackResult {
  baseRate: number;
  bonusRate: number;
  finalRate: number;
  cashbackAmount: number;
  isBoosted: boolean;
}

/**
 * Tính toán mức thưởng theo mô hình đường cong Parabol
 */
export function calculateParabolaBonus(hoanNgayRate: number): number {
  if (!Number.isFinite(hoanNgayRate) || hoanNgayRate <= 0) return 0.3;
  if (hoanNgayRate >= 8.0) return 1.0;
  if (hoanNgayRate <= 1.0) return 0.25;

  const raw = 1.0 - 0.0165 * Math.pow(8.0 - hoanNgayRate, 2);
  // Giới hạn trong khoảng an toàn [0.25%, 1.0%]
  return Math.max(0.25, Math.min(1.0, Number(raw.toFixed(2))));
}

/**
 * Tính toán tỷ lệ hoàn tiền tối ưu cho DealHoàn dựa trên tỷ lệ thị trường (Hoàn Ngay)
 */
export function boostCashbackRate(
  rawHoanNgayRate: number,
  productPrice: number,
  rawCashbackAmount?: number
): BoostedCashbackResult {
  const baseRate = Number(rawHoanNgayRate.toFixed(2));
  
  if (!Number.isFinite(baseRate) || baseRate <= 0) {
    const defaultRate = 5.0;
    const amount = productPrice > 0 ? Math.round(productPrice * (defaultRate / 100)) : 0;
    return {
      baseRate: defaultRate,
      bonusRate: 0,
      finalRate: defaultRate,
      cashbackAmount: amount,
      isBoosted: false,
    };
  }

  // 1. Tính mức thưởng theo đường cong Parabol
  const targetBonus = calculateParabolaBonus(baseRate);

  // 2. Chốt chặn an toàn: mức cộng tối đa không vượt quá 20% tỷ lệ của Hoàn Ngay
  const maxSafeBonus = Number((baseRate * 0.20).toFixed(2));
  const effectiveBonus = Math.min(targetBonus, Math.max(0.25, maxSafeBonus));

  // Tỷ lệ hoàn cuối cùng của DealHoàn
  const finalRate = Number((baseRate + effectiveBonus).toFixed(1));
  const actualBonus = Number((finalRate - baseRate).toFixed(1));

  // 3. Tính số tiền hoàn thực tế
  let cashbackAmount = 0;
  if (productPrice > 0) {
    cashbackAmount = Math.round(productPrice * (finalRate / 100));
  } else if (typeof rawCashbackAmount === "number" && rawCashbackAmount > 0) {
    cashbackAmount = Math.round(rawCashbackAmount * (finalRate / baseRate));
  }

  return {
    baseRate,
    bonusRate: actualBonus > 0 ? actualBonus : effectiveBonus,
    finalRate,
    cashbackAmount,
    isBoosted: true,
  };
}
