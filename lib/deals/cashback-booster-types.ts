/**
 * Types & pure mathematical functions for Cashback Booster
 * Safe for both Client Component and Server Component imports.
 */

export interface CashbackBoosterSettings {
  /** % hoàn tiền cho khách (mặc định 88.0%, hỗ trợ 1 số thập phân vd: 86.8%) */
  userCashbackPercent: number;
  /** % lợi nhuận DealHoàn giữ lại (tự tính: 100 - userCashbackPercent, vd: 12.0%) */
  safetyMarginPercent: number;
  boostFactor: number;
  maxBonusRate: number;
  minBonusRate: number;
  autoScaleWithUsers: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_BOOSTER_SETTINGS: CashbackBoosterSettings = {
  userCashbackPercent: 88.0,
  safetyMarginPercent: 12.0,
  boostFactor: 1.0,
  maxBonusRate: 1.0,
  minBonusRate: 0.3,
  autoScaleWithUsers: false,
  updatedAt: new Date().toISOString(),
  updatedBy: "system",
};

export interface BoostedCashbackResult {
  baseRate: number;
  bonusRate: number;
  finalRate: number;
  cashbackAmount: number;
  isBoosted: boolean;
}

/**
 * Tính toán mức thưởng theo mô hình đường cong Parabol
 * Phương trình: ΔR(x) = 1.0 - 0.0165 · (8.0 - x)²
 */
export function calculateParabolaBonus(
  hoanNgayRate: number,
  maxBonus = 1.0,
  minBonus = 0.3
): number {
  if (!Number.isFinite(hoanNgayRate) || hoanNgayRate <= 0) return minBonus;
  if (hoanNgayRate >= 8.0) return maxBonus;
  if (hoanNgayRate <= 1.0) return minBonus;

  // Tính tỷ lệ cong dạng parabol
  const scale = (maxBonus - minBonus) / 0.7; // chuẩn hóa theo biên độ [0.3 -> 1.0]
  const rawNormalized = 1.0 - 0.0165 * Math.pow(8.0 - hoanNgayRate, 2);
  const scaled = minBonus + (rawNormalized - 0.3) * scale;

  return Math.max(minBonus, Math.min(maxBonus, Number(scaled.toFixed(2))));
}
