export type ReferralStatus =
  | "locked"
  | "review_pending"
  | "unlocked"
  | "expired"
  | "revoked";

export type ReferralFraudStatus = "clean" | "flagged" | "blocked";

export interface ReferralSettings {
  enabled: boolean;
  /** Thưởng cho người giới thiệu A (VNĐ) */
  referrerReward: number;
  /** Thưởng cho người được mời B (VNĐ) */
  refereeReward: number;
  /** Mốc tổng (khả dụng + đã rút từ đơn hàng) của người giới thiệu A để mở khóa (VNĐ) */
  referrerMinQualifyingCashback: number;
  /** Mốc tổng (khả dụng + đã rút từ đơn hàng) của người được mời B để mở khóa (VNĐ) */
  refereeMinQualifyingCashback: number;
  /** Thời hạn mở khóa kể từ lúc đăng ký (ngày) */
  expiryDays: number;
  /** Chặn cứng trùng thiết bị (Device ID / Browser Fingerprint) */
  blockSameDevice: boolean;
  /** Chặn / gắn cờ trùng số tài khoản ngân hàng */
  blockSameBankAccount: boolean;
  /** Cửa sổ giờ gắn cờ trùng IP đăng ký (giờ) */
  flagSameIpHours: number;
  /** Số lượt đăng ký tối đa từ cùng 1 IP trong 7 ngày trước khi gắn cờ duyệt tay */
  maxReferralsPerIp7d: number;
  /** Số ngày tuổi tối đa của tài khoản mới được phép nhập mã giới thiệu (0 = không giới hạn) */
  maxAccountAgeDays: number;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_REFERRAL_SETTINGS: ReferralSettings = {
  enabled: true,
  referrerReward: 10000,
  refereeReward: 10000,
  referrerMinQualifyingCashback: 50000,
  refereeMinQualifyingCashback: 50000,
  expiryDays: 90,
  blockSameDevice: true,
  blockSameBankAccount: true,
  flagSameIpHours: 24,
  maxReferralsPerIp7d: 3,
  maxAccountAgeDays: 1,
};

export interface UserReferralRecord {
  id: string;
  referrer_id: string;
  referee_id: string;
  ref_code: string;
  status: ReferralStatus;
  referrer_reward: number;
  referee_reward: number;
  referrer_min_qualifying: number;
  referee_min_qualifying: number;
  fraud_status: ReferralFraudStatus;
  fraud_reasons: string[];
  referee_email_normalized?: string | null;
  referee_device_id?: string | null;
  referee_fingerprint_hash?: string | null;
  signup_ip_hash?: string | null;
  expires_at: string;
  unlocked_at?: string | null;
  expired_at?: string | null;
  revoked_at?: string | null;
  decided_by?: string | null;
  decision_note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserReferralOutgoingItem {
  id: string;
  refereeId: string;
  refereeLabel: string;
  status: ReferralStatus;
  fraudStatus: ReferralFraudStatus;
  rewardAmount: number;
  refereeQualifying: number;
  refereeTarget: number;
  referrerQualifying: number;
  referrerTarget: number;
  expiresAt: string;
  unlockedAt?: string | null;
  createdAt: string;
}

export interface UserReferralIncomingItem {
  id: string;
  referrerId: string;
  referrerLabel: string;
  refCode: string;
  status: ReferralStatus;
  fraudStatus: ReferralFraudStatus;
  rewardAmount: number;
  refereeQualifying: number;
  refereeTarget: number;
  referrerQualifying: number;
  referrerTarget: number;
  expiresAt: string;
  unlockedAt?: string | null;
  createdAt: string;
}

export interface UserReferralSummary {
  refCode: string;
  refLink: string;
  settings: ReferralSettings;
  ownQualifyingCashback: number;
  lockedBalance: number;
  totalUnlockedBonus: number;
  totalInvited: number;
  unlockedCount: number;
  lockedCount: number;
  canEnterManualCode: boolean;
  incoming: UserReferralIncomingItem | null;
  outgoing: UserReferralOutgoingItem[];
}

export type WalletLedgerEntryType =
  | "cashback_pending"
  | "cashback_settled"
  | "cashback_reverted"
  | "cashback_rejected"
  | "cashback_adjusted"
  | "referral_locked"
  | "referral_unlocked"
  | "referral_expired"
  | "referral_revoked"
  | "withdrawal_requested"
  | "withdrawal_completed"
  | "withdrawal_rejected"
  | "admin_adjustment"
  | "reconciliation_sync";

export interface WalletLedgerEntry {
  id: string;
  seq: number;
  user_id: string;
  user_email?: string;
  user_name?: string;
  user_ref_code?: string;
  entry_type: WalletLedgerEntryType;
  bucket: "balance" | "pending_balance" | "locked_balance" | "total_withdrawn" | "multi";
  delta_balance: number;
  delta_pending: number;
  delta_locked: number;
  delta_withdrawn: number;
  balance_after: number;
  pending_after: number;
  locked_after: number;
  withdrawn_after: number;
  reference_type?: string | null;
  reference_id?: string | null;
  idempotency_key?: string | null;
  actor_type: "system" | "user" | "admin" | "cron" | "webhook";
  actor_id?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface LedgerReconciliationRow {
  user_id: string;
  user_email?: string;
  user_name?: string;
  wallet_balance: number;
  wallet_pending: number;
  wallet_locked: number;
  wallet_withdrawn: number;
  ledger_balance: number;
  ledger_pending: number;
  ledger_locked: number;
  ledger_withdrawn: number;
  diff_balance: number;
  diff_pending: number;
  diff_locked: number;
  diff_withdrawn: number;
  ledger_entries: number;
  last_entry_at?: string | null;
}

export const FRAUD_REASON_LABELS: Record<string, string> = {
  same_ip_within_24h: "Trùng IP mạng trong 24h với người mời",
  ip_velocity_exceeded: "IP đăng ký vượt ngưỡng giới hạn trong 7 ngày",
  same_bank_account: "Trùng số tài khoản ngân hàng giữa A và B",
  bank_account_already_claimed: "Số tài khoản ngân hàng đã từng nhận thưởng giới thiệu",
  shared_device_detected: "Phát hiện dùng chung thiết bị / trình duyệt",
  missing_fingerprint_signal: "Thiếu dấu vân tay trình duyệt (nghi ngờ ẩn danh / giả lập)",
  missing_device_id_signal: "Thiếu mã định danh thiết bị trình duyệt",
  device_used_by_other_account: "Thiết bị đã từng đăng nhập tài khoản DealHoàn khác",
};

export const LEDGER_ENTRY_LABELS: Record<WalletLedgerEntryType, string> = {
  cashback_pending: "Đơn hàng chờ duyệt",
  cashback_settled: "Duyệt hoàn tiền vào khả dụng",
  cashback_reverted: "Hoàn tác đơn về chờ duyệt",
  cashback_rejected: "Hủy / từ chối đơn hoàn tiền",
  cashback_adjusted: "Điều chỉnh tiền hoàn đơn",
  referral_locked: "Cộng thưởng giới thiệu (Đang khóa)",
  referral_unlocked: "Mở khóa thưởng giới thiệu",
  referral_expired: "Hết hạn thưởng giới thiệu",
  referral_revoked: "Thu hồi thưởng giới thiệu",
  withdrawal_requested: "Tạo lệnh rút tiền",
  withdrawal_completed: "Xác nhận chuyển khoản rút tiền",
  withdrawal_rejected: "Từ chối lệnh rút (Hoàn về ví)",
  admin_adjustment: "Admin điều chỉnh số dư",
  reconciliation_sync: "Đồng bộ đối soát số dư",
};
