/**
 * Types & pure mathematical functions for Cashback Booster
 * Safe for both Client Component and Server Component imports.
 */

export interface CashbackBoosterSettings {
  boostFactor: number;
  maxBonusRate: number;
  minBonusRate: number;
  safetyMarginPercent: number;
  autoScaleWithUsers: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_BOOSTER_SETTINGS: CashbackBoosterSettings = {
  boostFactor: 1.0,
  maxBonusRate: 1.0,
  minBonusRate: 0.3,
  safetyMarginPercent: 12.0,
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
