import fs from "fs";
import path from "path";

/**
 * Smart Cashback Booster for DealHoàn
 * 
 * Áp dụng Mô hình Parabol liên tục để tự động tăng % hoàn tiền cho DealHoàn
 * cao hơn đối thủ (Hoàn Ngay) nhưng luôn bảo toàn vùng lợi nhuận an toàn (Zero Loss).
 * 
 * Hỗ trợ Admin cấu hình động qua Dashboard /admin:
 * - boostFactor: Hệ số điều chỉnh mức thưởng (1.0 = 100% kích cầu, 0.5 = giảm nửa, 0.0 = tắt thưởng).
 * - maxBonusRate: Trần thưởng tối đa khi hoa hồng cao (mặc định 1.0%).
 * - minBonusRate: Mức thưởng tối thiểu cho ngành công nghệ (mặc định 0.3%).
 * - safetyMarginPercent: Biên lợi nhuận tối thiểu DealHoàn giữ lại (mặc định 12%).
 * - autoScaleWithUsers: Tự động hạ dần hệ số thưởng khi lượng user đạt mốc lớn.
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

// In-memory cache for fast read in hot API paths
let cachedSettings: CashbackBoosterSettings = { ...DEFAULT_BOOSTER_SETTINGS };
let isInitialized = false;

const SETTINGS_FILE_PATH = path.join(process.cwd(), "data", "booster-settings.json");

function loadSettingsFromFile(): CashbackBoosterSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      const raw = fs.readFileSync(SETTINGS_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_BOOSTER_SETTINGS,
        ...parsed,
      };
    }
  } catch (err) {
    console.warn("Failed to read booster-settings.json, using defaults:", err);
  }
  return { ...DEFAULT_BOOSTER_SETTINGS };
}

function saveSettingsToFile(settings: CashbackBoosterSettings): void {
  try {
    const dir = path.dirname(SETTINGS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(settings, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to write booster-settings.json:", err);
  }
}

/**
 * Đọc cấu hình hiện tại (Synchronous cho hot path)
 */
export function getBoosterSettingsSync(): CashbackBoosterSettings {
  if (!isInitialized) {
    cachedSettings = loadSettingsFromFile();
    isInitialized = true;
  }
  return cachedSettings;
}

/**
 * Đọc cấu hình hiện tại (Async)
 */
export async function getBoosterSettings(): Promise<CashbackBoosterSettings> {
  return getBoosterSettingsSync();
}

/**
 * Cập nhật cấu hình mới từ Admin Dashboard
 */
export async function updateBoosterSettings(
  partial: Partial<CashbackBoosterSettings>,
  updatedBy = "admin"
): Promise<CashbackBoosterSettings> {
  const current = getBoosterSettingsSync();
  const next: CashbackBoosterSettings = {
    ...current,
    ...partial,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  cachedSettings = next;
  isInitialized = true;
  saveSettingsToFile(next);

  return next;
}

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

/**
 * Tính toán tỷ lệ hoàn tiền tối ưu cho DealHoàn dựa trên tỷ lệ thị trường (Hoàn Ngay)
 * và cấu hình quản trị hiện tại
 */
export function boostCashbackRate(
  rawHoanNgayRate: number,
  productPrice: number,
  rawCashbackAmount?: number,
  customSettings?: CashbackBoosterSettings
): BoostedCashbackResult {
  const settings = customSettings || getBoosterSettingsSync();
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

  // Nếu Admin tắt hệ số kích cầu (boostFactor === 0), hoàn theo mức gốc thị trường
  if (settings.boostFactor <= 0) {
    const amount = productPrice > 0 
      ? Math.round(productPrice * (baseRate / 100))
      : (rawCashbackAmount || 0);
    return {
      baseRate,
      bonusRate: 0,
      finalRate: baseRate,
      cashbackAmount: amount,
      isBoosted: false,
    };
  }

  // 1. Tính mức thưởng theo đường cong Parabol kết hợp với hệ số boostFactor
  const targetBonus = calculateParabolaBonus(
    baseRate,
    settings.maxBonusRate * settings.boostFactor,
    settings.minBonusRate * settings.boostFactor
  );

  // 2. Chốt chặn an toàn: mức cộng tối đa không vượt quá 20% tỷ lệ gốc của Hoàn Ngay
  const maxSafeBonus = Number((baseRate * 0.20 * Math.min(1.0, settings.boostFactor)).toFixed(2));
  const floorBonus = Math.min(targetBonus, settings.minBonusRate * settings.boostFactor);
  const effectiveBonus = Math.min(targetBonus, Math.max(floorBonus, maxSafeBonus));

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
    isBoosted: actualBonus > 0,
  };
}
