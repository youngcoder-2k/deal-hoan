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

export function normalizeBoosterSettings(raw?: Partial<CashbackBoosterSettings>): CashbackBoosterSettings {
  if (!raw) return { ...DEFAULT_BOOSTER_SETTINGS };
  let userPercent = typeof raw.userCashbackPercent === "number" && !isNaN(raw.userCashbackPercent)
    ? Number(raw.userCashbackPercent.toFixed(1))
    : typeof raw.safetyMarginPercent === "number" && !isNaN(raw.safetyMarginPercent)
      ? Number((100 - raw.safetyMarginPercent).toFixed(1))
      : 88.0;

  userPercent = Math.max(50.0, Math.min(98.0, userPercent));
  const profitMargin = Number((100 - userPercent).toFixed(1));

  return {
    ...DEFAULT_BOOSTER_SETTINGS,
    ...raw,
    userCashbackPercent: userPercent,
    safetyMarginPercent: profitMargin,
  };
}

// In-memory cache for fast read in hot API paths
let cachedSettings: CashbackBoosterSettings = { ...DEFAULT_BOOSTER_SETTINGS };
let isInitialized = false;

const SETTINGS_FILE_PATH = path.join(process.cwd(), "data", "booster-settings.json");

function loadSettingsFromFile(): CashbackBoosterSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      const raw = fs.readFileSync(SETTINGS_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      return normalizeBoosterSettings(parsed);
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
  const next = normalizeBoosterSettings({
    ...current,
    ...partial,
    updatedAt: new Date().toISOString(),
    updatedBy,
  });

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
 * Tính toán tỷ lệ hoàn tiền thực tế cho người dùng:
 * 1. ĐÃ TRỪ PHẦN CHIẾT KHẤU NỀN TẢNG (safetyMarginPercent, mặc định 12%):
 *    Số tiền hiển thị là số tiền thực nhận sau khi nền tảng giữ lại phí vận hành (88% hoa hồng).
 * 2. Ưu tiên số tiền hoa hồng thực tế từ sàn (rawCashbackAmount/commission) kèm mức trần (cap).
 * 3. Nếu tính theo % danh mục, tự động bóc tách thuế VAT 8% (tính trên giá trước thuế)
 *    để số tiền hiển thị sát nhất với thực tế đơn hàng Shopee ghi nhận.
 */
export function boostCashbackRate(
  rawHoanNgayRate: number,
  productPrice: number,
  rawCashbackAmount?: number,
  customSettings?: CashbackBoosterSettings,
  cap?: number
): BoostedCashbackResult {
  const settings = customSettings || getBoosterSettingsSync();
  const baseRate = Number(rawHoanNgayRate.toFixed(2));
  
  // Tỷ lệ % hoàn tiền cho người dùng (mặc định 88.0%, hỗ trợ 1 số thập phân vd: 86.8%)
  const userSharePercent = typeof settings.userCashbackPercent === "number" && !isNaN(settings.userCashbackPercent)
    ? settings.userCashbackPercent
    : (100 - (settings.safetyMarginPercent ?? 12.0));
  const baseUserShare = Math.max(0.5, Math.min(0.98, userSharePercent / 100));

  if (!Number.isFinite(baseRate) || baseRate <= 0) {
    const defaultGrossRate = 5.0;
    const defaultUserRate = Number((defaultGrossRate * baseUserShare).toFixed(1));
    const amount = productPrice > 0 ? Math.round(productPrice * (defaultUserRate / 100)) : 0;
    return {
      baseRate: defaultGrossRate,
      bonusRate: 0,
      finalRate: defaultUserRate,
      cashbackAmount: amount,
      isBoosted: false,
    };
  }

  // 1. Nếu có số tiền hoa hồng thực tế từ sàn (rawCashbackAmount):
  // rawCashbackAmount (từ Shopee/Longhouse) là tổng hoa hồng Shopee trả về cho DealHoàn.
  // Người dùng nhận chính xác tỷ lệ % DealHoàn chia (mặc định 88% khi giữ 12% phí vận hành/an toàn).
  if (typeof rawCashbackAmount === "number" && rawCashbackAmount > 0) {
    const netCashback = Math.round(rawCashbackAmount * baseUserShare);
    const finalRate = productPrice > 0
      ? Number(((netCashback / productPrice) * 100).toFixed(1))
      : Number((baseRate * baseUserShare).toFixed(1));

    return {
      baseRate,
      bonusRate: 0,
      finalRate: Math.max(0.1, finalRate),
      cashbackAmount: netCashback,
      isBoosted: false,
    };
  }

  // 2. Nếu tính theo tỷ lệ % danh mục (chưa có hoa hồng tuyệt đối):
  // Shopee/Lazada bóc tách thuế VAT (8%) trước khi nhân tỷ lệ:
  const preTaxPrice = productPrice > 0 ? productPrice / 1.08 : 0;
  const grossCommission = preTaxPrice > 0 ? preTaxPrice * (baseRate / 100) : 0;
  let netCashback = Math.round(grossCommission * baseUserShare);

  if (typeof cap === "number" && cap > 0) {
    const netCap = Math.round(cap * baseUserShare);
    if (netCashback > netCap) {
      netCashback = netCap;
    }
  }

  const finalRate = productPrice > 0
    ? Number(((netCashback / productPrice) * 100).toFixed(1))
    : Number((baseRate * baseUserShare).toFixed(1));

  return {
    baseRate,
    bonusRate: 0,
    finalRate: Math.max(0.1, finalRate),
    cashbackAmount: netCashback,
    isBoosted: false,
  };
}
