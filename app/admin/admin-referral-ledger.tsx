"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  DownloadSimple,
  Gift,
  LockKey,
  MagnifyingGlass,
  ShieldWarning,
  BookOpenText,
  XCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  DEFAULT_REFERRAL_SETTINGS,
  FRAUD_REASON_LABELS,
  LEDGER_ENTRY_LABELS,
  type LedgerReconciliationRow,
  type ReferralSettings,
  type WalletLedgerEntry,
  type WalletLedgerEntryType,
} from "@/lib/referral/types";
import { escapeCsvCell } from "@/lib/referral/csv";
import design from "./admin-users.module.css";

function formatVnd(n: number) {
  return `${Math.round(n || 0).toLocaleString("vi-VN")}đ`;
}

function formatSignedVnd(n: number) {
  const val = Math.round(n || 0);
  if (val === 0) return "—";
  return `${val > 0 ? "+" : ""}${val.toLocaleString("vi-VN")}đ`;
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/* ============================================================================
 * 1. CARD CẤU HÌNH CHƯƠNG TRÌNH GIỚI THIỆU (nhúng trong tab Cài đặt /admin)
 * ============================================================================ */
export function AdminReferralSettingsCard({
  referralSettings,
  userCashbackPercent,
  onChange,
}: {
  referralSettings: ReferralSettings;
  userCashbackPercent: number;
  onChange: (next: ReferralSettings) => void;
}) {
  const s = { ...DEFAULT_REFERRAL_SETTINGS, ...referralSettings };
  const marginPct = Math.max(0.1, 100 - (userCashbackPercent || 88));
  const totalRewardPair = s.referrerReward + s.refereeReward;
  const estProfitFromB = Math.round((s.refereeMinQualifyingCashback * marginPct) / (userCashbackPercent || 88));
  const estProfitFromPair = Math.round(
    ((s.referrerMinQualifyingCashback + s.refereeMinQualifyingCashback) * marginPct) /
      (userCashbackPercent || 88)
  );
  const netPairDelta = estProfitFromPair - totalRewardPair;

  const updateField = <K extends keyof ReferralSettings>(key: K, value: ReferralSettings[K]) => {
    onChange({ ...s, [key]: value });
  };

  return (
    <div className="bg-white border border-[#dfe5ed] rounded-xl p-6 mt-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-base font-bold text-[#17212f] flex items-center gap-2 m-0">
            <Gift size={20} weight="duotone" className="text-[#ee4c23]" />
            <span>Cấu hình chương trình Giới thiệu bạn bè</span>
          </h2>
          <p className="text-xs text-[#657084] mt-1 mb-0">
            Điều chỉnh thưởng Đang khóa, mốc mở khóa (Khả dụng + Đã rút), thời hạn và cơ chế chống gian lận thiết bị / IP / ngân hàng.
          </p>
        </div>
        <label className="inline-flex items-center gap-2.5 cursor-pointer select-none px-3 py-1.5 rounded-lg border border-[#dfe5ed] bg-stone-50">
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={(e) => updateField("enabled", e.target.checked)}
            className="w-4 h-4 accent-[#ee4c23]"
          />
          <span className="text-xs font-bold text-[#17212f]">
            {s.enabled ? "Đang bật chương trình" : "Đang tạm tắt"}
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#475569]">
          <span>Thưởng người giới thiệu A (VNĐ)</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={s.referrerReward}
            onChange={(e) => updateField("referrerReward", Math.max(0, Number(e.target.value) || 0))}
            className="h-10 px-3 rounded-lg border border-[#cbd5e1] text-sm font-bold text-[#17212f] bg-white focus:border-[#ee4c23] outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#475569]">
          <span>Thưởng người được mời B (VNĐ)</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={s.refereeReward}
            onChange={(e) => updateField("refereeReward", Math.max(0, Number(e.target.value) || 0))}
            className="h-10 px-3 rounded-lg border border-[#cbd5e1] text-sm font-bold text-[#17212f] bg-white focus:border-[#ee4c23] outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#475569]">
          <span>Thời hạn mở khóa (Ngày)</span>
          <input
            type="number"
            min={1}
            max={365}
            value={s.expiryDays}
            onChange={(e) => updateField("expiryDays", Math.max(1, Math.min(365, Number(e.target.value) || 90)))}
            className="h-10 px-3 rounded-lg border border-[#cbd5e1] text-sm font-bold text-[#17212f] bg-white focus:border-[#ee4c23] outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#475569]">
          <span>Mốc mở khóa của A: Khả dụng + Đã rút (VNĐ)</span>
          <input
            type="number"
            min={0}
            step={5000}
            value={s.referrerMinQualifyingCashback}
            onChange={(e) =>
              updateField("referrerMinQualifyingCashback", Math.max(0, Number(e.target.value) || 0))
            }
            className="h-10 px-3 rounded-lg border border-[#cbd5e1] text-sm font-bold text-[#17212f] bg-white focus:border-[#ee4c23] outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#475569]">
          <span>Mốc mở khóa của B: Khả dụng + Đã rút (VNĐ)</span>
          <input
            type="number"
            min={0}
            step={5000}
            value={s.refereeMinQualifyingCashback}
            onChange={(e) =>
              updateField("refereeMinQualifyingCashback", Math.max(0, Number(e.target.value) || 0))
            }
            className="h-10 px-3 rounded-lg border border-[#cbd5e1] text-sm font-bold text-[#17212f] bg-white focus:border-[#ee4c23] outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#475569]">
          <span>Cửa sổ cảnh báo trùng IP (Giờ) / Giới hạn IP 7 ngày</span>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={720}
              value={s.flagSameIpHours}
              onChange={(e) => updateField("flagSameIpHours", Math.max(1, Number(e.target.value) || 24))}
              className="h-10 px-3 rounded-lg border border-[#cbd5e1] text-sm font-bold text-[#17212f] bg-white w-1/2 focus:border-[#ee4c23] outline-none"
              title="Số giờ kiểm tra trùng IP"
            />
            <input
              type="number"
              min={1}
              max={100}
              value={s.maxReferralsPerIp7d}
              onChange={(e) => updateField("maxReferralsPerIp7d", Math.max(1, Number(e.target.value) || 3))}
              className="h-10 px-3 rounded-lg border border-[#cbd5e1] text-sm font-bold text-[#17212f] bg-white w-1/2 focus:border-[#ee4c23] outline-none"
              title="Số lượt đăng ký tối đa / IP / 7 ngày"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-[#475569]">
          <span>Tuổi TK tối đa được nhập mã (Ngày, 0 = không GH)</span>
          <input
            type="number"
            min={0}
            max={3650}
            value={s.maxAccountAgeDays}
            onChange={(e) =>
              updateField(
                "maxAccountAgeDays",
                Math.max(0, Math.min(3650, Number(e.target.value) || 0))
              )
            }
            className="h-10 px-3 rounded-lg border border-[#cbd5e1] text-sm font-bold text-[#17212f] bg-white focus:border-[#ee4c23] outline-none"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-5 mt-4 pt-4 border-t border-[#eef2f6]">
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#334155] cursor-pointer">
          <input
            type="checkbox"
            checked={s.blockSameDevice}
            onChange={(e) => updateField("blockSameDevice", e.target.checked)}
            className="w-4 h-4 accent-[#ee4c23]"
          />
          <span>Chặn cứng trùng Thiết bị (Device ID &amp; Browser Fingerprint)</span>
        </label>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#334155] cursor-pointer">
          <input
            type="checkbox"
            checked={s.blockSameBankAccount}
            onChange={(e) => updateField("blockSameBankAccount", e.target.checked)}
            className="w-4 h-4 accent-[#ee4c23]"
          />
          <span>Chặn / chuyển duyệt tay khi trùng STK ngân hàng</span>
        </label>
      </div>

      {/* Dự tính dòng tiền trực tiếp theo % hoàn tiền động của Admin */}
      <div className="mt-4 p-3.5 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] text-xs text-[#475569] flex flex-wrap gap-x-6 gap-y-1.5">
        <span>
          Tỷ lệ hoàn hiện tại: <strong className="text-[#ee4c23]">{userCashbackPercent.toFixed(1)}%</strong> (Biên DealHoàn{" "}
          <strong className="text-[#109452]">{marginPct.toFixed(1)}%</strong>)
        </span>
        <span>
          Tổng thưởng 1 cặp (A+B): <strong className="text-[#17212f]">{formatVnd(totalRewardPair)}</strong>
        </span>
        <span>
          Lãi ước tính từ cặp A+B đạt mốc: <strong>{formatVnd(estProfitFromPair)}</strong> (riêng từ B:{" "}
          <strong>{formatVnd(estProfitFromB)}</strong>)
        </span>
        <span className={netPairDelta >= 0 ? "text-[#047857] font-bold" : "text-[#b45309] font-bold"}>
          {netPairDelta >= 0
            ? `✓ Lãi ròng ngay tại mốc mở khóa: +${formatVnd(netPairDelta)}`
            : `Chênh lệch chi phí kéo user tại mốc: ${formatVnd(netPairDelta)}`}
        </span>
      </div>
    </div>
  );
}

/* ============================================================================
 * 2. TAB QUẢN LÝ GIỚI THIỆU BẠN BÈ (/admin -> Giới thiệu)
 * ============================================================================ */
interface AdminReferralRow {
  id: string;
  referrer_id: string;
  referee_id: string;
  ref_code: string;
  status: string;
  referrer_reward: number;
  referee_reward: number;
  referrer_min_qualifying: number;
  referee_min_qualifying: number;
  fraud_status: string;
  fraud_reasons: string[];
  expires_at: string;
  unlocked_at?: string | null;
  created_at: string;
  decision_note?: string | null;
  referrerEmail: string;
  referrerName: string;
  referrerRefCode: string;
  referrerBankAccountNo: string;
  referrerQualifying: number;
  refereeEmail: string;
  refereeName: string;
  refereeRefCode: string;
  refereeBankAccountNo: string;
  refereeQualifying: number;
}

export function AdminReferralsTab({
  getHeaders,
  onToast,
}: {
  getHeaders: () => Record<string, string>;
  onToast: (msg: string) => void;
}) {
  const [rows, setRows] = useState<AdminReferralRow[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    locked: 0,
    reviewPending: 0,
    unlocked: 0,
    expired: 0,
    revoked: 0,
    totalLockedAmount: 0,
    totalUnlockedAmount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const getHeadersRef = useRef(getHeaders);
  const onToastRef = useRef(onToast);
  useEffect(() => {
    getHeadersRef.current = getHeaders;
    onToastRef.current = onToast;
  });

  const loadData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== "all") qs.set("status", statusFilter);
      if (query.trim()) qs.set("q", query.trim());
      const res = await fetch(`/api/admin/referrals?${qs.toString()}`, {
        headers: getHeadersRef.current(),
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRows(data.referrals || []);
        if (data.stats) setStats(data.stats);
        setWarning(data.warning || null);
      } else {
        onToastRef.current("⚠️ " + (data.error || "Không thể tải dữ liệu giới thiệu."));
      }
    } catch {
      onToastRef.current("⚠️ Lỗi kết nối khi tải dữ liệu giới thiệu.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadData(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  const handleDecision = async (referralId: string, action: "approve" | "revoke") => {
    const promptMsg =
      action === "approve"
        ? "Xác nhận DUYỆT MỞ KHÓA thưởng giới thiệu sang số dư khả dụng cho cả A và B.\nNhập ghi chú kiểm toán (có thể để trống):"
        : "Xác nhận THU HỒI khoản thưởng Đang khóa này (sẽ trừ locked_balance và ghi Sổ cái).\nNhập lý do thu hồi (có thể để trống):";
    const defaultNote =
      action === "approve"
        ? "Admin duyệt mở khóa hợp lệ"
        : "Thu hồi do nghi ngờ gian lận / vi phạm chính sách";
    let note = "";
    if (typeof window !== "undefined") {
      const entered = window.prompt(promptMsg, defaultNote);
      if (entered === null) return;
      note = entered.trim();
    }

    setBusyId(referralId);
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ referralId, action, note: note || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onToast(data.message || "Đã cập nhật.");
        void loadData();
      } else {
        onToast("⚠️ " + (data.error || "Không thể xử lý."));
      }
    } catch {
      onToast("⚠️ Lỗi kết nối máy chủ.");
    } finally {
      setBusyId(null);
    }
  };

  const handleSweep = async () => {
    setSweeping(true);
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ action: "evaluate_all" }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onToast("✓ " + (data.message || "Đã rà soát mở khóa & hết hạn."));
        void loadData();
      } else {
        onToast("⚠️ " + (data.error || "Rà soát thất bại."));
      }
    } catch {
      onToast("⚠️ Lỗi kết nối khi rà soát.");
    } finally {
      setSweeping(false);
    }
  };

  const statusBadge = (st: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      locked: { label: "Đang khóa", cls: "bg-amber-50 text-amber-800 border-amber-200" },
      review_pending: { label: "Chờ Admin duyệt", cls: "bg-blue-50 text-blue-800 border-blue-200" },
      unlocked: { label: "Đã mở khóa", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
      expired: { label: "Hết hạn", cls: "bg-stone-100 text-stone-600 border-stone-200" },
      revoked: { label: "Đã thu hồi", cls: "bg-red-50 text-red-700 border-red-200" },
    };
    const item = map[st] || { label: st, cls: "bg-stone-100 text-stone-700 border-stone-200" };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${item.cls}`}>
        {item.label}
      </span>
    );
  };

  return (
    <section>
      <div className={design.titleBar}>
        <div>
          <h1>Chương trình Giới thiệu bạn bè</h1>
        </div>
        <div className="admin-actions-area">
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={() => void loadData()}
            disabled={loading}
          >
            <ArrowClockwise size={17} className={loading ? "animate-spin" : ""} />
            <span>Làm mới</span>
          </button>
          <button
            type="button"
            className="admin-btn-primary"
            onClick={handleSweep}
            disabled={sweeping}
          >
            <LockKey size={17} weight="bold" />
            <span>{sweeping ? "Đang rà soát…" : "Rà soát mở khóa & hết hạn"}</span>
          </button>
        </div>
      </div>

      {warning && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
          <WarningCircle size={18} weight="fill" className="shrink-0 text-amber-600" />
          <span>{warning}</span>
        </div>
      )}

      <section className="admin-kpi-grid mb-5">
        <div className="admin-kpi-card">
          <span className="kpi-label">Tổng lượt giới thiệu</span>
          <strong className="kpi-value">{stats.total}</strong>
        </div>
        <div className="admin-kpi-card">
          <span className="kpi-label">Cần Admin duyệt (cờ gian lận)</span>
          <strong className="kpi-value text-[#d97706]">{stats.reviewPending}</strong>
        </div>
        <div className="admin-kpi-card">
          <span className="kpi-label">Tổng tiền thưởng Đang khóa</span>
          <strong className="kpi-value text-[#b45309]">{formatVnd(stats.totalLockedAmount)}</strong>
        </div>
        <div className="admin-kpi-card">
          <span className="kpi-label">Tổng thưởng Đã mở khóa</span>
          <strong className="kpi-value text-green">{formatVnd(stats.totalUnlockedAmount)}</strong>
        </div>
      </section>

      <div className="bg-white border border-[#dfe5ed] rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo email, tên, mã mời A hoặc B..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#cbd5e1] text-sm outline-none focus:border-[#ee4c23]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[#cbd5e1] text-sm bg-white outline-none focus:border-[#ee4c23]"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="review_pending">Chờ Admin duyệt ({stats.reviewPending})</option>
          <option value="locked">Đang khóa ({stats.locked})</option>
          <option value="unlocked">Đã mở khóa ({stats.unlocked})</option>
          <option value="expired">Hết hạn ({stats.expired})</option>
          <option value="revoked">Đã thu hồi ({stats.revoked})</option>
        </select>
      </div>

      <div className="bg-white border border-[#dfe5ed] rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#475569]">
              <th className="p-3 font-bold">Người mời (A)</th>
              <th className="p-3 font-bold">Người được mời (B)</th>
              <th className="p-3 font-bold">Tiến độ mốc</th>
              <th className="p-3 font-bold">Thưởng (A / B)</th>
              <th className="p-3 font-bold">Chống gian lận</th>
              <th className="p-3 font-bold">Trạng thái &amp; Hạn</th>
              <th className="p-3 font-bold text-right">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[#64748b]">
                  Đang tải danh sách giới thiệu…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[#64748b]">
                  Chưa có lượt giới thiệu nào khớp bộ lọc.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const sameBank =
                  Boolean(r.referrerBankAccountNo) &&
                  Boolean(r.refereeBankAccountNo) &&
                  r.referrerBankAccountNo.replace(/\D/g, "") === r.refereeBankAccountNo.replace(/\D/g, "");
                const reasons = Array.isArray(r.fraud_reasons) ? r.fraud_reasons : [];
                return (
                  <tr key={r.id} className="border-b border-[#f1f5f9] hover:bg-[#fffbf8]">
                    <td className="p-3 align-top">
                      <div className="font-bold text-[#17212f]">{r.referrerName}</div>
                      <div className="text-[#64748b]">{r.referrerEmail}</div>
                      <div className="text-[11px] font-mono text-[#94a3b8]">
                        {r.referrerRefCode}
                        {r.referrerBankAccountNo ? ` · STK: ${r.referrerBankAccountNo}` : ""}
                      </div>
                    </td>
                    <td className="p-3 align-top">
                      <div className="font-bold text-[#17212f]">{r.refereeName}</div>
                      <div className="text-[#64748b]">{r.refereeEmail}</div>
                      <div className="text-[11px] font-mono text-[#94a3b8]">
                        {r.refereeRefCode}
                        {r.refereeBankAccountNo ? ` · STK: ${r.refereeBankAccountNo}` : ""}
                      </div>
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <div>
                        A:{" "}
                        <strong
                          className={
                            r.referrerQualifying >= r.referrer_min_qualifying ? "text-[#047857]" : "text-[#b45309]"
                          }
                        >
                          {formatVnd(r.referrerQualifying)}
                        </strong>{" "}
                        / {formatVnd(r.referrer_min_qualifying)}
                      </div>
                      <div className="mt-1">
                        B:{" "}
                        <strong
                          className={
                            r.refereeQualifying >= r.referee_min_qualifying ? "text-[#047857]" : "text-[#b45309]"
                          }
                        >
                          {formatVnd(r.refereeQualifying)}
                        </strong>{" "}
                        / {formatVnd(r.referee_min_qualifying)}
                      </div>
                    </td>
                    <td className="p-3 align-top whitespace-nowrap font-bold text-[#17212f]">
                      <div>A: +{formatVnd(r.referrer_reward)}</div>
                      <div>B: +{formatVnd(r.referee_reward)}</div>
                    </td>
                    <td className="p-3 align-top">
                      {reasons.length === 0 && !sameBank && r.fraud_status === "clean" ? (
                        <span className="inline-flex items-center gap-1 text-[#047857] font-semibold">
                          <CheckCircle size={14} weight="fill" /> Hợp lệ
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {reasons.map((code) => (
                            <span
                              key={code}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded"
                            >
                              <ShieldWarning size={13} weight="fill" />
                              {FRAUD_REASON_LABELS[code] || code}
                            </span>
                          ))}
                          {sameBank && !reasons.includes("same_bank_account") && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                              <ShieldWarning size={13} weight="fill" /> Trùng STK ngân hàng A &amp; B
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-3 align-top whitespace-nowrap">
                      <div>{statusBadge(r.status)}</div>
                      <div className="text-[11px] text-[#64748b] mt-1">Tạo: {formatDateTime(r.created_at)}</div>
                      <div className="text-[11px] text-[#64748b]">Hạn: {formatDateTime(r.expires_at)}</div>
                    </td>
                    <td className="p-3 align-top text-right whitespace-nowrap">
                      {r.status === "locked" || r.status === "review_pending" ? (
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void handleDecision(r.id, "approve")}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs disabled:opacity-50"
                          >
                            <CheckCircle size={14} weight="bold" /> Duyệt mở
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void handleDecision(r.id, "revoke")}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs disabled:opacity-50"
                          >
                            <XCircle size={14} weight="bold" /> Thu hồi
                          </button>
                        </div>
                      ) : (
                        <span className="text-[#94a3b8] text-[11px]">{r.decision_note || "Hoàn tất"}</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ============================================================================
 * 3. TAB SỔ CÁI TÀI CHÍNH (/admin -> Sổ cái) — Kiểm toán toàn bộ biến động tiền
 * ============================================================================ */
export function AdminLedgerTab({
  getHeaders,
  onToast,
}: {
  getHeaders: () => Record<string, string>;
  onToast: (msg: string) => void;
}) {
  const [entries, setEntries] = useState<WalletLedgerEntry[]>([]);
  const [reconciliation, setReconciliation] = useState<LedgerReconciliationRow[]>([]);
  const [summary, setSummary] = useState({
    totalEntries: 0,
    totalMatchedCount: 0,
    isTruncated: false,
    totalCashbackSettled: 0,
    totalReferralUnlocked: 0,
    totalReferralLockedNet: 0,
    totalWithdrawnNet: 0,
    mismatchedWallets: 0,
    openingBalanceWallets: 0,
  });
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [group, setGroup] = useState("all");
  const [entryType, setEntryType] = useState("all");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [onlyMismatchedRecon, setOnlyMismatchedRecon] = useState(false);
  const getHeadersRef = useRef(getHeaders);
  const onToastRef = useRef(onToast);
  useEffect(() => {
    getHeadersRef.current = getHeaders;
    onToastRef.current = onToast;
  });

  const loadLedger = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (group !== "all") qs.set("group", group);
      if (entryType !== "all") qs.set("entryType", entryType);
      if (query.trim()) qs.set("q", query.trim());
      if (fromDate) qs.set("from", fromDate);
      if (toDate) qs.set("to", toDate);
      qs.set("limit", "300");

      const res = await fetch(`/api/admin/ledger?${qs.toString()}`, {
        headers: getHeadersRef.current(),
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEntries(data.entries || []);
        setReconciliation(data.reconciliation || []);
        if (data.summary) {
          setSummary((prev) => ({ ...prev, ...data.summary }));
        }
        setWarning(data.warning || null);
      } else {
        onToastRef.current("⚠️ " + (data.error || "Không thể tải Sổ cái."));
      }
    } catch {
      onToastRef.current("⚠️ Lỗi kết nối khi tải Sổ cái.");
    } finally {
      setLoading(false);
    }
  }, [group, entryType, query, fromDate, toDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadLedger(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [loadLedger]);

  const exportCsv = () => {
    const header = [
      "Seq",
      "Thoi gian",
      "User Email",
      "Ma User",
      "Loai but toan",
      "Bien dong Kha dung",
      "Bien dong Cho duyet",
      "Bien dong Dang khoa",
      "Bien dong Da rut",
      "Kha dung sau GD",
      "Cho duyet sau GD",
      "Dang khoa sau GD",
      "Da rut sau GD",
      "Tham chieu",
      "Tac nhan",
      "Ghi chu",
    ];
    const csvRows = [
      header.map(escapeCsvCell).join(","),
      ...entries.map((e) =>
        [
          e.seq,
          e.created_at,
          e.user_email || "",
          e.user_ref_code || e.user_id,
          LEDGER_ENTRY_LABELS[e.entry_type] || e.entry_type,
          e.delta_balance,
          e.delta_pending,
          e.delta_locked,
          e.delta_withdrawn,
          e.balance_after,
          e.pending_after,
          e.locked_after,
          e.withdrawn_after,
          e.reference_id || "",
          `${e.actor_type}:${e.actor_id || ""}`,
          e.note || "",
        ]
          .map(escapeCsvCell)
          .join(",")
      ),
    ];
    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dealhoan-so-cai-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast(`✓ Đã xuất ${entries.length} dòng Sổ cái ra file CSV!`);
  };

  const entryBadgeClass = (type: WalletLedgerEntryType) => {
    if (type.startsWith("referral_unlocked") || type === "cashback_settled") {
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    }
    if (type.startsWith("referral_locked") || type === "cashback_pending") {
      return "bg-amber-50 text-amber-800 border-amber-200";
    }
    if (type.startsWith("withdrawal_")) {
      return "bg-blue-50 text-blue-800 border-blue-200";
    }
    if (type.includes("rejected") || type.includes("revoked") || type.includes("expired")) {
      return "bg-red-50 text-red-700 border-red-200";
    }
    return "bg-purple-50 text-purple-800 border-purple-200";
  };

  return (
    <section>
      <div className={design.titleBar}>
        <div>
          <h1>Sổ cái tài chính (Append-Only Ledger)</h1>
        </div>
        <div className="admin-actions-area">
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={() => setShowReconciliation((v) => !v)}
          >
            <BookOpenText size={17} />
            <span>{showReconciliation ? "Ẩn bảng đối soát" : "Đối soát Ví ↔ Sổ cái"}</span>
          </button>
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={() => void loadLedger()}
            disabled={loading}
          >
            <ArrowClockwise size={17} className={loading ? "animate-spin" : ""} />
            <span>Làm mới</span>
          </button>
          <button
            type="button"
            className="admin-btn-primary"
            onClick={exportCsv}
            disabled={entries.length === 0}
          >
            <DownloadSimple size={17} />
            <span>Xuất CSV</span>
          </button>
        </div>
      </div>

      {warning && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
          <WarningCircle size={18} weight="fill" className="shrink-0 text-amber-600" />
          <span>{warning}</span>
        </div>
      )}

      <section className="admin-kpi-grid mb-5">
        <div className="admin-kpi-card">
          <span className="kpi-label">Bút toán đang hiển thị</span>
          <strong className="kpi-value">
            {summary.totalEntries}
            {summary.isTruncated && (
              <span className="text-xs font-semibold text-[#64748b] ml-1.5">
                / {summary.totalMatchedCount}
              </span>
            )}
          </strong>
        </div>
        <div className="admin-kpi-card">
          <span className="kpi-label">Hoàn tiền duyệt (trong bộ lọc)</span>
          <strong className="kpi-value text-green">{formatVnd(summary.totalCashbackSettled)}</strong>
        </div>
        <div className="admin-kpi-card">
          <span className="kpi-label">Thưởng GT mở khóa (trong bộ lọc)</span>
          <strong className="kpi-value text-[#ee4c23]">{formatVnd(summary.totalReferralUnlocked)}</strong>
        </div>
        <div className="admin-kpi-card">
          <span className="kpi-label">Đối soát Sổ cái ↔ Ví</span>
          <strong
            className={`kpi-value ${summary.mismatchedWallets === 0 ? "text-green" : "text-red-600"}`}
          >
            {summary.mismatchedWallets === 0 ? "Khớp 100%" : `${summary.mismatchedWallets} ví lệch`}
          </strong>
        </div>
      </section>

      {showReconciliation && (
        <div className="bg-white border border-[#dfe5ed] rounded-xl p-4 mb-5 overflow-x-auto">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <h3 className="text-sm font-bold text-[#17212f] m-0">
                Bảng đối soát tổng biến động Sổ cái vs Số dư thực tế trên ví
              </h3>
              <span className="text-xs text-[#64748b]">
                (Ví có số dư cũ từ trước ngày bật Sổ cái: {summary.openingBalanceWallets} ví đầu kỳ · Ví phát sinh sổ cái bị lệch: {summary.mismatchedWallets})
              </span>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#334155] cursor-pointer">
              <input
                type="checkbox"
                checked={onlyMismatchedRecon}
                onChange={(e) => setOnlyMismatchedRecon(e.target.checked)}
                className="w-4 h-4 accent-[#ee4c23]"
              />
              <span>Chỉ xem ví có chênh lệch</span>
            </label>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#475569]">
                <th className="p-2.5 font-bold">Người dùng</th>
                <th className="p-2.5 font-bold text-right">Ví Khả dụng / Sổ cái</th>
                <th className="p-2.5 font-bold text-right">Ví Chờ / Sổ cái</th>
                <th className="p-2.5 font-bold text-right">Ví Khóa / Sổ cái</th>
                <th className="p-2.5 font-bold text-right">Đã rút / Sổ cái</th>
                <th className="p-2.5 font-bold text-center">Số bút toán</th>
                <th className="p-2.5 font-bold text-center">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const visibleRecon = onlyMismatchedRecon
                  ? reconciliation.filter(
                      (r) =>
                        r.diff_balance !== 0 ||
                        r.diff_pending !== 0 ||
                        r.diff_locked !== 0 ||
                        r.diff_withdrawn !== 0
                    )
                  : reconciliation;
                if (visibleRecon.length === 0) {
                  return (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-[#64748b]">
                        {onlyMismatchedRecon
                          ? "Không có ví nào bị chênh lệch giữa Ví và Sổ cái."
                          : "Chưa có dữ liệu đối soát."}
                      </td>
                    </tr>
                  );
                }
                return visibleRecon.map((r) => {
                  const ok =
                    r.diff_balance === 0 &&
                    r.diff_pending === 0 &&
                    r.diff_locked === 0 &&
                    r.diff_withdrawn === 0;
                  const diffParts: string[] = [];
                  if (r.diff_balance !== 0) diffParts.push(`KD ${formatSignedVnd(r.diff_balance)}`);
                  if (r.diff_pending !== 0) diffParts.push(`CD ${formatSignedVnd(r.diff_pending)}`);
                  if (r.diff_locked !== 0) diffParts.push(`K ${formatSignedVnd(r.diff_locked)}`);
                  if (r.diff_withdrawn !== 0) diffParts.push(`R ${formatSignedVnd(r.diff_withdrawn)}`);
                  return (
                    <tr key={r.user_id} className="border-b border-[#f1f5f9]">
                      <td className="p-2.5">
                        <div className="font-semibold text-[#17212f]">{r.user_name}</div>
                        <div className="text-[11px] text-[#64748b]">{r.user_email}</div>
                      </td>
                      <td className="p-2.5 text-right font-mono">
                        {formatVnd(r.wallet_balance)} / {formatVnd(r.ledger_balance)}
                      </td>
                      <td className="p-2.5 text-right font-mono">
                        {formatVnd(r.wallet_pending)} / {formatVnd(r.ledger_pending)}
                      </td>
                      <td className="p-2.5 text-right font-mono">
                        {formatVnd(r.wallet_locked)} / {formatVnd(r.ledger_locked)}
                      </td>
                      <td className="p-2.5 text-right font-mono">
                        {formatVnd(r.wallet_withdrawn)} / {formatVnd(r.ledger_withdrawn)}
                      </td>
                      <td className="p-2.5 text-center font-bold">{r.ledger_entries}</td>
                      <td className="p-2.5 text-center">
                        {ok ? (
                          <span className="text-emerald-700 font-bold">✓ Khớp</span>
                        ) : r.ledger_entries === 0 ? (
                          <span className="text-stone-500">Số dư đầu kỳ</span>
                        ) : (
                          <span className="text-amber-700 font-bold">
                            Lệch ({diffParts.join(", ")})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white border border-[#dfe5ed] rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm email, mã đơn, mã giới thiệu, #seq, ghi chú..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-[#cbd5e1] text-sm outline-none focus:border-[#ee4c23]"
          />
        </div>
        <select
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setEntryType("all");
          }}
          className="h-9 px-3 rounded-lg border border-[#cbd5e1] text-sm bg-white outline-none focus:border-[#ee4c23]"
        >
          <option value="all">Tất cả nhóm tiền</option>
          <option value="cashback">Hoàn tiền đơn hàng</option>
          <option value="referral">Thưởng giới thiệu</option>
          <option value="withdrawal">Rút tiền</option>
          <option value="admin">Admin điều chỉnh</option>
        </select>
        <select
          value={entryType}
          onChange={(e) => setEntryType(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[#cbd5e1] text-sm bg-white outline-none focus:border-[#ee4c23]"
        >
          <option value="all">Tất cả loại bút toán</option>
          {Object.entries(LEDGER_ENTRY_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="h-9 px-2.5 rounded-lg border border-[#cbd5e1] text-xs bg-white"
          title="Từ ngày"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="h-9 px-2.5 rounded-lg border border-[#cbd5e1] text-xs bg-white"
          title="Đến ngày"
        />
      </div>

      <div className="bg-white border border-[#dfe5ed] rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#475569]">
              <th className="p-3 font-bold">#Seq / Thời gian</th>
              <th className="p-3 font-bold">Người dùng</th>
              <th className="p-3 font-bold">Loại bút toán</th>
              <th className="p-3 font-bold text-right">Khả dụng</th>
              <th className="p-3 font-bold text-right">Chờ duyệt</th>
              <th className="p-3 font-bold text-right">Đang khóa</th>
              <th className="p-3 font-bold text-right">Đã rút</th>
              <th className="p-3 font-bold text-right">Số dư sau GD</th>
              <th className="p-3 font-bold">Tham chiếu &amp; Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-[#64748b]">
                  Đang tải dữ liệu Sổ cái…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-[#64748b]">
                  Chưa có bút toán nào trong Sổ cái khớp điều kiện lọc.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-b border-[#f1f5f9] hover:bg-[#fffbf8]">
                  <td className="p-3 align-top whitespace-nowrap">
                    <div className="font-mono font-bold text-[#17212f]">#{e.seq}</div>
                    <div className="text-[11px] text-[#64748b]">{formatDateTime(e.created_at)}</div>
                  </td>
                  <td className="p-3 align-top">
                    <div className="font-semibold text-[#17212f]">{e.user_name}</div>
                    <div className="text-[11px] text-[#64748b]">{e.user_email}</div>
                    <div className="text-[10.5px] font-mono text-[#94a3b8]">{e.user_ref_code}</div>
                  </td>
                  <td className="p-3 align-top whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${entryBadgeClass(
                        e.entry_type
                      )}`}
                    >
                      {LEDGER_ENTRY_LABELS[e.entry_type] || e.entry_type}
                    </span>
                    <div className="text-[10.5px] text-[#94a3b8] mt-1">
                      {e.actor_type}
                      {e.actor_id ? ` · ${e.actor_id}` : ""}
                    </div>
                  </td>
                  <td
                    className={`p-3 align-top text-right font-mono font-bold whitespace-nowrap ${
                      e.delta_balance > 0
                        ? "text-[#047857]"
                        : e.delta_balance < 0
                        ? "text-[#b91c1c]"
                        : "text-[#cbd5e1]"
                    }`}
                  >
                    {formatSignedVnd(e.delta_balance)}
                  </td>
                  <td
                    className={`p-3 align-top text-right font-mono font-semibold whitespace-nowrap ${
                      e.delta_pending > 0
                        ? "text-[#d97706]"
                        : e.delta_pending < 0
                        ? "text-[#64748b]"
                        : "text-[#cbd5e1]"
                    }`}
                  >
                    {formatSignedVnd(e.delta_pending)}
                  </td>
                  <td
                    className={`p-3 align-top text-right font-mono font-semibold whitespace-nowrap ${
                      e.delta_locked > 0
                        ? "text-[#b45309]"
                        : e.delta_locked < 0
                        ? "text-[#64748b]"
                        : "text-[#cbd5e1]"
                    }`}
                  >
                    {formatSignedVnd(e.delta_locked)}
                  </td>
                  <td
                    className={`p-3 align-top text-right font-mono font-semibold whitespace-nowrap ${
                      e.delta_withdrawn > 0
                        ? "text-[#1d4ed8]"
                        : e.delta_withdrawn < 0
                        ? "text-[#047857]"
                        : "text-[#cbd5e1]"
                    }`}
                  >
                    {formatSignedVnd(e.delta_withdrawn)}
                  </td>
                  <td className="p-3 align-top text-right font-mono text-[11px] text-[#475569] whitespace-nowrap">
                    <div>KD: {formatVnd(e.balance_after)}</div>
                    <div>CD: {formatVnd(e.pending_after)} · K: {formatVnd(e.locked_after)}</div>
                  </td>
                  <td className="p-3 align-top max-w-[260px]">
                    {e.reference_id && (
                      <div className="font-mono text-[10.5px] text-[#475569] break-all">
                        {e.reference_type ? `[${e.reference_type}] ` : ""}
                        {e.reference_id}
                      </div>
                    )}
                    {e.note && <div className="text-[#334155] mt-0.5 leading-snug">{e.note}</div>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
