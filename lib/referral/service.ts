import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { parseUserIdFromSubId } from "@/lib/deals/affiliate";
import { getReferralSettings } from "./config";
import {
  hashSignal,
  maskDisplayIdentity,
  normalizeEmailForFraudCheck,
  normalizeRefCode,
  sanitizeDeviceId,
  sanitizeFingerprintHash,
} from "./anti-fraud";
import type {
  UserReferralIncomingItem,
  UserReferralOutgoingItem,
  UserReferralRecord,
  UserReferralSummary,
  WalletLedgerEntryType,
} from "./types";

const FULL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResolvedAuthUser {
  id: string;
  email: string;
  fullName: string;
}

/**
 * Tra cứu chủ nhân của mã giới thiệu (hỗ trợ u_xxxxxxxx, dh..., hoặc UUID đầy đủ).
 * Trả về null nếu không tồn tại hoặc mã ngắn trùng lặp không xác định được duy nhất.
 */
export async function resolveReferrerByCode(
  rawCode?: string | null
): Promise<ResolvedAuthUser | null> {
  const code = normalizeRefCode(rawCode);
  if (!code) return null;

  const parsed = parseUserIdFromSubId(code) || code.replace(/^u_/i, "");
  if (!parsed) return null;

  const db = getSupabaseServiceClient();
  if (!db?.auth?.admin) return null;

  if (FULL_UUID_RE.test(parsed)) {
    const { data, error } = await db.auth.admin.getUserById(parsed);
    if (error || !data?.user) return null;
    const u = data.user;
    return {
      id: u.id,
      email: u.email || "",
      fullName: String(u.user_metadata?.full_name || u.user_metadata?.name || ""),
    };
  }

  if (!/^[0-9a-f]{8,32}$/i.test(parsed)) return null;
  const prefix = parsed.toLowerCase();
  let match: ResolvedAuthUser | null = null;

  for (let page = 1; page <= 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !Array.isArray(data?.users)) return null;
    for (const u of data.users) {
      const cleanHex = u.id.replace(/-/g, "").toLowerCase();
      if (u.id.toLowerCase().startsWith(prefix) || cleanHex.startsWith(prefix)) {
        if (match && match.id !== u.id) return null; // Ambiguous prefix
        match = {
          id: u.id,
          email: u.email || "",
          fullName: String(u.user_metadata?.full_name || u.user_metadata?.name || ""),
        };
      }
    }
    if (data.users.length < 200) return match;
  }

  return null;
}

/**
 * Ghi nhận tín hiệu thiết bị (Device ID + Browser Fingerprint + IP băm) cho user đang đăng nhập.
 */
export async function recordUserDeviceSignal(params: {
  userId: string;
  deviceId?: string | null;
  fingerprintHash?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<boolean> {
  const db = getSupabaseServiceClient();
  if (!db || !params.userId || !FULL_UUID_RE.test(params.userId)) return false;

  const deviceId = sanitizeDeviceId(params.deviceId);
  const fingerprintHash = sanitizeFingerprintHash(params.fingerprintHash);
  const ipHash = params.ip ? hashSignal(params.ip, "ip") : "";
  const effectiveDeviceId = deviceId || (fingerprintHash ? `fp_${fingerprintHash.slice(0, 32)}` : "");
  if (!effectiveDeviceId) return false;

  try {
    const nowIso = new Date().toISOString();
    const { error } = await db.from("user_device_signals").upsert(
      {
        user_id: params.userId,
        device_id: effectiveDeviceId,
        fingerprint_hash: fingerprintHash || null,
        ip_hash: ipHash || null,
        user_agent: params.userAgent ? params.userAgent.slice(0, 300) : null,
        last_seen_at: nowIso,
      },
      { onConflict: "user_id,device_id" }
    );
    return !error;
  } catch {
    return false;
  }
}

/**
 * Áp dụng mã giới thiệu cho người dùng mới B:
 * - Chống tự mời, trùng email chuẩn hóa, trùng Device ID / Browser Fingerprint, tài khoản đã có đơn.
 * - Gắn cờ cảnh báo nếu trùng IP mạng trong cửa sổ cấu hình.
 * - Cộng ngay +10.000đ (theo cấu hình Admin) vào locked_balance cho cả A và B + ghi Sổ cái nguyên tử.
 */
export async function claimReferralForUser(params: {
  refereeId: string;
  refereeEmail?: string | null;
  refCode: string;
  deviceId?: string | null;
  fingerprintHash?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{
  success: boolean;
  code?: string;
  error?: string;
  referral?: UserReferralRecord;
}> {
  const db = getSupabaseServiceClient();
  if (!db) {
    return { success: false, code: "db_unavailable", error: "Hệ thống chưa kết nối cơ sở dữ liệu." };
  }

  const refCode = normalizeRefCode(params.refCode);
  if (!refCode) {
    return { success: false, code: "missing_ref_code", error: "Vui lòng nhập mã giới thiệu hợp lệ." };
  }

  const referrer = await resolveReferrerByCode(refCode);
  if (!referrer) {
    return { success: false, code: "referrer_not_found", error: "Mã giới thiệu không tồn tại hoặc không hợp lệ." };
  }

  if (referrer.id === params.refereeId) {
    return { success: false, code: "self_referral_not_allowed", error: "Bạn không thể tự giới thiệu chính mình." };
  }

  const deviceId = sanitizeDeviceId(params.deviceId);
  const fingerprintHash = sanitizeFingerprintHash(params.fingerprintHash);
  const ipHash = params.ip ? hashSignal(params.ip, "ip") : "";

  // Ghi nhận tín hiệu thiết bị của B
  await recordUserDeviceSignal({
    userId: params.refereeId,
    deviceId,
    fingerprintHash,
    ip: params.ip,
    userAgent: params.userAgent,
  });

  // Đảm bảo cấu hình referral mới nhất đã đồng bộ lên app_settings
  await getReferralSettings();

  const { data, error } = await db.rpc("register_user_referral", {
    p_payload: {
      referrer_id: referrer.id,
      referee_id: params.refereeId,
      ref_code: `u_${referrer.id.slice(0, 8)}`,
      referee_email_normalized: normalizeEmailForFraudCheck(params.refereeEmail),
      referrer_email_normalized: normalizeEmailForFraudCheck(referrer.email),
      device_id: deviceId,
      fingerprint_hash: fingerprintHash,
      ip_hash: ipHash,
    },
  });

  if (error) {
    console.warn("[referral] register_user_referral RPC error:", error.message);
    return {
      success: false,
      code: "rpc_failed",
      error: "Tính năng giới thiệu đang được khởi tạo cơ sở dữ liệu. Vui lòng thử lại sau.",
    };
  }

  const res = (data || {}) as {
    success?: boolean;
    code?: string;
    error?: string;
    referral?: UserReferralRecord;
  };

  if (!res.success) {
    return {
      success: false,
      code: res.code || "claim_rejected",
      error: res.error || "Không thể áp dụng mã giới thiệu.",
    };
  }

  return {
    success: true,
    referral: res.referral,
  };
}

/**
 * Tự động kiểm tra mở khóa & hết hạn thưởng giới thiệu cho 1 user.
 */
export async function evaluateReferralUnlocks(userId: string): Promise<{
  unlocked: number;
  review_pending: number;
  expired: number;
}> {
  const empty = { unlocked: 0, review_pending: 0, expired: 0 };
  const db = getSupabaseServiceClient();
  if (!db || !userId || !FULL_UUID_RE.test(userId)) return empty;
  try {
    const { data, error } = await db.rpc("evaluate_referral_unlocks_for_user", {
      p_user_id: userId,
    });
    if (error || !data) return empty;
    return {
      unlocked: Number(data.unlocked || 0),
      review_pending: Number(data.review_pending || 0),
      expired: Number(data.expired || 0),
    };
  } catch {
    return empty;
  }
}

/**
 * Quét hết hạn hàng loạt các khoản thưởng đang khóa quá hạn (chạy qua cron / admin).
 */
export async function expireOverdueReferrals(): Promise<number> {
  const db = getSupabaseServiceClient();
  if (!db) return 0;
  try {
    const { data, error } = await db.rpc("expire_overdue_referrals");
    if (error || !data) return 0;
    return Number(data.expired_count || 0);
  } catch {
    return 0;
  }
}

/**
 * Tính số tiền tích lũy đủ điều kiện mở khóa của 1 user (khả dụng + đã rút từ mua hàng thật).
 */
export async function getUserQualifyingCashback(userId: string): Promise<number> {
  const db = getSupabaseServiceClient();
  if (!db || !FULL_UUID_RE.test(userId)) return 0;
  try {
    const { data, error } = await db.rpc("compute_user_qualifying_cashback", {
      p_user_id: userId,
    });
    if (!error && typeof data === "number") return Math.max(0, Math.round(data));
  } catch {}

  // Fallback nếu RPC chưa được chạy trên DB
  try {
    const [ordersRes, walletRes] = await Promise.all([
      db.from("cashback_orders").select("cashback_amount").eq("user_id", userId).eq("status", "completed"),
      db.from("user_wallets").select("balance, total_withdrawn").eq("user_id", userId).maybeSingle(),
    ]);
    const ordersSum = (ordersRes.data || []).reduce((s, o) => s + Number(o.cashback_amount || 0), 0);
    const walletSum = Number(walletRes.data?.balance || 0) + Number(walletRes.data?.total_withdrawn || 0);
    return Math.max(ordersSum, walletSum);
  } catch {
    return 0;
  }
}

/**
 * Lấy toàn bộ dữ liệu hiển thị cho tab "Giới thiệu" trong Ví người dùng.
 */
export async function getUserReferralSummary(
  userId: string,
  origin?: string
): Promise<UserReferralSummary> {
  const settings = await getReferralSettings();
  const refCode = `u_${userId.slice(0, 8)}`;
  const siteBase = (origin || process.env.NEXT_PUBLIC_SITE_URL || "https://dealhoan.com").replace(/\/+$/, "");
  const refLink = `${siteBase}/?ref=${refCode}`;

  const db = getSupabaseServiceClient();
  if (!db || !FULL_UUID_RE.test(userId)) {
    return {
      refCode,
      refLink,
      settings,
      ownQualifyingCashback: 0,
      lockedBalance: 0,
      totalUnlockedBonus: 0,
      totalInvited: 0,
      unlockedCount: 0,
      lockedCount: 0,
      canEnterManualCode: false,
      incoming: null,
      outgoing: [],
    };
  }

  // Luôn tự đánh giá mở khóa / hết hạn trước khi trả số liệu cho user
  await evaluateReferralUnlocks(userId);

  const [walletRes, refsRes, ownQualifying, ordersCountRes, authUserRes] = await Promise.all([
    db
      .from("user_wallets")
      .select("balance, pending_balance, locked_balance, total_withdrawn")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("user_referrals")
      .select("*")
      .or(`referrer_id.eq.${userId},referee_id.eq.${userId}`)
      .order("created_at", { ascending: false }),
    getUserQualifyingCashback(userId),
    db.from("cashback_orders").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } })),
  ]);

  const rows = (Array.isArray(refsRes.data) ? refsRes.data : []) as UserReferralRecord[];
  const incomingRow = rows.find((r) => r.referee_id === userId) || null;
  const outgoingRows = rows.filter((r) => r.referrer_id === userId);

  // Gom toàn bộ counterparty IDs để lấy tên ẩn danh + tiến độ 50k của họ (chạy theo lô 10 để không làm quá tải Supabase)
  const otherUserIds = Array.from(
    new Set([
      ...(incomingRow ? [incomingRow.referrer_id] : []),
      ...outgoingRows.map((r) => r.referee_id),
    ])
  );

  const identityMap = new Map<string, string>();
  const qualifyingMap = new Map<string, number>();

  const BATCH_SIZE = 10;
  for (let i = 0; i < otherUserIds.length; i += BATCH_SIZE) {
    const batch = otherUserIds.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (uid) => {
        try {
          const [uRes, qual] = await Promise.all([
            db.auth.admin.getUserById(uid).catch(() => ({ data: { user: null } })),
            getUserQualifyingCashback(uid),
          ]);
          const u = uRes?.data?.user;
          identityMap.set(
            uid,
            maskDisplayIdentity(
              String(u?.user_metadata?.full_name || u?.user_metadata?.name || ""),
              u?.email || ""
            )
          );
          qualifyingMap.set(uid, qual);
        } catch {
          identityMap.set(uid, "Thành viên DealHoàn");
          qualifyingMap.set(uid, 0);
        }
      })
    );
  }

  const incoming: UserReferralIncomingItem | null = incomingRow
    ? {
        id: incomingRow.id,
        referrerId: incomingRow.referrer_id,
        referrerLabel: identityMap.get(incomingRow.referrer_id) || "Thành viên DealHoàn",
        refCode: incomingRow.ref_code,
        status: incomingRow.status,
        fraudStatus: incomingRow.fraud_status,
        rewardAmount: Number(incomingRow.referee_reward || 0),
        refereeQualifying: ownQualifying,
        refereeTarget: Number(incomingRow.referee_min_qualifying || settings.refereeMinQualifyingCashback),
        referrerQualifying: qualifyingMap.get(incomingRow.referrer_id) || 0,
        referrerTarget: Number(incomingRow.referrer_min_qualifying || settings.referrerMinQualifyingCashback),
        expiresAt: incomingRow.expires_at,
        unlockedAt: incomingRow.unlocked_at,
        createdAt: incomingRow.created_at,
      }
    : null;

  const outgoing: UserReferralOutgoingItem[] = outgoingRows.map((row) => ({
    id: row.id,
    refereeId: row.referee_id,
    refereeLabel: identityMap.get(row.referee_id) || "Thành viên DealHoàn",
    status: row.status,
    fraudStatus: row.fraud_status,
    rewardAmount: Number(row.referrer_reward || 0),
    refereeQualifying: qualifyingMap.get(row.referee_id) || 0,
    refereeTarget: Number(row.referee_min_qualifying || settings.refereeMinQualifyingCashback),
    referrerQualifying: ownQualifying,
    referrerTarget: Number(row.referrer_min_qualifying || settings.referrerMinQualifyingCashback),
    expiresAt: row.expires_at,
    unlockedAt: row.unlocked_at,
    createdAt: row.created_at,
  }));

  const unlockedFromOutgoing = outgoingRows
    .filter((r) => r.status === "unlocked")
    .reduce((sum, r) => sum + Number(r.referrer_reward || 0), 0);
  const unlockedFromIncoming =
    incomingRow && incomingRow.status === "unlocked" ? Number(incomingRow.referee_reward || 0) : 0;

  const lockedFromRows =
    outgoingRows
      .filter((r) => r.status === "locked" || r.status === "review_pending")
      .reduce((sum, r) => sum + Number(r.referrer_reward || 0), 0) +
    (incomingRow && (incomingRow.status === "locked" || incomingRow.status === "review_pending")
      ? Number(incomingRow.referee_reward || 0)
      : 0);

  const walletLockedRaw = walletRes.data?.locked_balance;
  const lockedBalance =
    walletLockedRaw !== undefined && walletLockedRaw !== null
      ? Math.max(0, Number(walletLockedRaw))
      : lockedFromRows;

  const hasWalletActivity =
    Number(walletRes.data?.balance || 0) > 0 ||
    Number(walletRes.data?.pending_balance || 0) > 0 ||
    Number(walletRes.data?.total_withdrawn || 0) > 0;

  const createdAtRaw = authUserRes?.data?.user?.created_at;
  const createdAtMs = createdAtRaw ? Date.parse(createdAtRaw) : NaN;
  const accountAgeOk =
    settings.maxAccountAgeDays <= 0 ||
    !Number.isFinite(createdAtMs) ||
    Date.now() - createdAtMs <= settings.maxAccountAgeDays * 24 * 60 * 60 * 1000;

  return {
    refCode,
    refLink,
    settings,
    ownQualifyingCashback: ownQualifying,
    lockedBalance,
    totalUnlockedBonus: unlockedFromOutgoing + unlockedFromIncoming,
    totalInvited: outgoing.length,
    unlockedCount: outgoing.filter((r) => r.status === "unlocked").length,
    lockedCount: outgoing.filter((r) => r.status === "locked" || r.status === "review_pending").length,
    canEnterManualCode:
      settings.enabled &&
      !incomingRow &&
      Number(ordersCountRes.count || 0) === 0 &&
      !hasWalletActivity &&
      accountAgeOk,
    incoming,
    outgoing,
  };
}

/**
 * Đồng bộ pending_balance nguyên tử qua RPC (có khóa FOR UPDATE + ghi Sổ cái reconciliation_sync).
 */
export async function reconcileWalletPendingBalance(
  userId: string,
  actorId = "wallet_api_sync"
): Promise<{ synced: boolean; pendingBalance: number; deltaPending: number } | null> {
  const db = getSupabaseServiceClient();
  if (!db || !userId || !FULL_UUID_RE.test(userId)) return null;
  try {
    const { data, error } = await db.rpc("reconcile_wallet_pending_balance", {
      p_user_id: userId,
      p_actor_id: actorId,
    });
    if (error || !data) return null;
    return {
      synced: Boolean(data.synced),
      pendingBalance: Number(data.pending_balance || 0),
      deltaPending: Number(data.delta_pending || 0),
    };
  } catch {
    return null;
  }
}

/**
 * Fallback ghi Sổ cái tài chính cho các nhánh API không đi qua Stored Procedure.
 */
export async function appendWalletLedgerFallback(params: {
  userId: string;
  entryType: WalletLedgerEntryType;
  deltaBalance?: number;
  deltaPending?: number;
  deltaLocked?: number;
  deltaWithdrawn?: number;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey?: string;
  actorType?: "system" | "user" | "admin" | "cron" | "webhook";
  actorId?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = getSupabaseServiceClient();
  if (!db || !params.userId || !FULL_UUID_RE.test(params.userId)) return;

  try {
    const { error } = await db.rpc("append_wallet_ledger", {
      p_user_id: params.userId,
      p_entry_type: params.entryType,
      p_delta_balance: Math.round(params.deltaBalance || 0),
      p_delta_pending: Math.round(params.deltaPending || 0),
      p_delta_locked: Math.round(params.deltaLocked || 0),
      p_delta_withdrawn: Math.round(params.deltaWithdrawn || 0),
      p_reference_type: params.referenceType || null,
      p_reference_id: params.referenceId || null,
      p_idempotency_key: params.idempotencyKey || null,
      p_actor_type: params.actorType || "system",
      p_actor_id: params.actorId || null,
      p_note: params.note || null,
      p_metadata: params.metadata || {},
    });
    if (error) {
      // Bảng sổ cái có thể chưa chạy migration -> không chặn luồng chính
      console.warn("[wallet_ledger] fallback RPC skipped:", error.message);
    }
  } catch {
    // Non-fatal fallback
  }
}
