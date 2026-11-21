"use client";

import React, { useState, useEffect, useRef, useId } from "react";
import Link from "next/link";
import Image from "next/image";
import { Wallet, Clock, Bank, ShoppingBag, CreditCard, X, CaretDown, Question, CheckCircle, Info, SignOut, Copy, Gift, LockKey, ShareNetwork } from "@phosphor-icons/react";
import s from "./account-wallet.module.css";
import type { User } from "@supabase/supabase-js";
import { getVietQrBankCode } from "@/lib/deals/vietqr";
import type { UserReferralSummary } from "@/lib/referral/types";
import { collectDeviceIdentity } from "@/lib/referral/device-fingerprint";

export interface WalletData {
  balance: number;
  pending_balance: number;
  locked_balance: number;
  total_withdrawn: number;
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
}

export interface WithdrawalItem {
  id: string;
  amount: number;
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  status: "pending" | "completed" | "rejected";
  note?: string | null;
  created_at: string;
}

export interface CashbackOrderItem {
  id: string;
  order_id: string;
  platform: "Shopee" | "ShopeeFood" | "TikTok Shop" | "Lazada";
  product_name?: string | null;
  product_image?: string | null;
  order_value: number;
  cashback_amount: number;
  status: "tracking" | "pending" | "completed" | "rejected";
  note?: string | null;
  ordered_at: string;
  is_tracking_session?: boolean;
}

const VN_BANKS = [
  "Vietcombank (VCB)",
  "MB Bank (MBB)",
  "Techcombank (TCB)",
  "VietinBank (CTG)",
  "BIDV",
  "ACB",
  "VPBank",
  "TPBank",
  "Agribank",
  "Sacombank",
  "VIB",
  "HDBank",
  "SHB",
  "MSB",
  "OCB",
  "SeABank",
  "LPBank",
  "Nam A Bank",
  "Eximbank",
  "Bac A Bank",
  "PVcomBank",
  "BaoViet Bank",
  "Kienlongbank",
  "VietABank",
  "Saigonbank",
  "Shinhan Bank",
  "Woori Bank",
];

function formatVnd(amount: number) {
  return amount.toLocaleString("vi-VN") + "đ";
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", {
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

function formatDateShort(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function cleanProductTitle(raw: string): string {
  if (!raw) return "Sản phẩm mua qua DealHoàn";
  let title = raw.trim();
  // Bỏ hậu tố số lượng sản phẩm gộp "(+1 sp)"
  title = title.replace(/\(\+\d+\s*sp\)$/i, "").trim();
  // Bỏ tiền tố ngoặc vuông quảng cáo spam [CHÍNH HÃNG], [KHÔNG LED], ...
  title = title.replace(/^\[[^\]]+\]\s*/g, "").trim();
  // Nếu có thông số kỹ thuật phân tách bởi | thì lấy tên chính gọn gàng
  if (title.includes("|")) {
    const parts = title.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts[0] && parts[0].length >= 15) {
      title = parts[0];
    }
  }
  return title || raw;
}

function cleanUserNote(note?: string | null, status?: string): string | null {
  if (!note || status === "completed") return null;
  const lower = note.toLowerCase();
  // Lọc bỏ toàn bộ thuật ngữ nội bộ kế toán của admin
  if (lower.includes("admin duyệt") || lower.includes("giải ngân")) return null;
  // Trích xuất ngày dự kiến hoàn tiền ngắn gọn
  const estMatch = note.match(/dự kiến\s*(?:khả dụng|cộng ví)?[:\s]*(\d{1,2}\/\d{1,2}(?:\/\d{4})?)/i);
  if (estMatch) {
    return `Dự kiến: ${estMatch[1]}`;
  }
  if (status === "rejected" || lower.includes("hủy") || lower.includes("từ chối")) {
    return "Đơn bị hủy hoặc không đủ điều kiện";
  }
  if (lower.includes("tra cứu")) {
    return "Đang chờ đối soát từ sàn";
  }
  return null;
}

export default function AccountModal({
  user,
  initialBalance,
  onClose,
  onSignOut,
  onNotify,
}: {
  user: User;
  initialBalance?: number;
  onClose: () => void;
  onSignOut: () => void;
  onNotify: (msg: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"orders" | "referral" | "withdraw">("orders");
  const [wallet, setWallet] = useState<WalletData>(() => {
    let savedBank = { bank_name: "", bank_account_no: "", bank_account_name: "" };
    const savedStats = {
      balance: initialBalance ?? 0,
      pending_balance: 0,
      locked_balance: 0,
      total_withdrawn: 0,
    };
    if (typeof window !== "undefined") {
      try {
        const storedBank = localStorage.getItem("dealhoan_bank_info_" + user.id);
        if (storedBank) {
          const parsed = JSON.parse(storedBank);
          savedBank = {
            bank_name: parsed.bank_name || "",
            bank_account_no: parsed.bank_account_no || "",
            bank_account_name: parsed.bank_account_name || "",
          };
        }
      } catch {}
    }
    return {
      ...savedStats,
      ...savedBank,
    };
  });
  const [history, setHistory] = useState<WithdrawalItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("dealhoan_pending_withdrawals_" + user.id);
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return [];
  });
  const [orders, setOrders] = useState<CashbackOrderItem[]>([]);

  // Form Ngân hàng
  const [bankName, setBankName] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("dealhoan_bank_info_" + user.id);
        if (stored) return JSON.parse(stored).bank_name || VN_BANKS[0];
      } catch {}
    }
    return VN_BANKS[0];
  });
  const [accountNo, setAccountNo] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("dealhoan_bank_info_" + user.id);
        if (stored) return JSON.parse(stored).bank_account_no || "";
      } catch {}
    }
    return "";
  });
  const [accountName, setAccountName] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("dealhoan_bank_info_" + user.id);
        if (stored) return JSON.parse(stored).bank_account_name || "";
      } catch {}
    }
    return "";
  });
  const [savingBank, setSavingBank] = useState(false);
  const [bankSavedSuccess, setBankSavedSuccess] = useState(false);

  // Form Rút tiền
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [showVietQr, setShowVietQr] = useState(false);
  const [activeQrItem, setActiveQrItem] = useState<WithdrawalItem | null>(null);

  const [editingBank, setEditingBank] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState({ wallet: true, orders: true, history: true });
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [referral, setReferral] = useState<UserReferralSummary | null>(null);
  const [referralLoading, setReferralLoading] = useState(true);
  const [manualRefInput, setManualRefInput] = useState("");
  const [claimingRef, setClaimingRef] = useState(false);
  const [claimRefError, setClaimRefError] = useState("");
  const [nowMs] = useState(() => Date.now());
  const openerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const tabId = useId();

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = oldOverflow;
      openerRef.current?.focus();
    };
  }, []);

  const refCode = `u_${user.id.slice(0, 8)}`;

  // Tải dữ liệu ví và lịch sử từ server
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("dealhoan_shopping_sessions");
      } catch {}
    }
    let cancelled = false;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 12000);

    const applyWalletData = (serverW: WalletData) => {
      if (serverW.bank_account_no) {
        setWallet(serverW);
        setBankName(serverW.bank_name || VN_BANKS[0]);
        setAccountNo(serverW.bank_account_no);
        setAccountName(serverW.bank_account_name || "");
        try {
          localStorage.setItem(
            "dealhoan_bank_info_" + user.id,
            JSON.stringify({
              bank_name: serverW.bank_name || VN_BANKS[0],
              bank_account_no: serverW.bank_account_no,
              bank_account_name: serverW.bank_account_name || "",
            })
          );
        } catch {}
      } else {
        try {
          const stored = localStorage.getItem("dealhoan_bank_info_" + user.id);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.bank_account_no) {
              setWallet((prev) => ({
                ...prev,
                ...serverW,
                bank_name: parsed.bank_name || VN_BANKS[0],
                bank_account_no: parsed.bank_account_no,
                bank_account_name: parsed.bank_account_name || "",
              }));
              setBankName(parsed.bank_name || VN_BANKS[0]);
              setAccountNo(parsed.bank_account_no);
              setAccountName(parsed.bank_account_name || "");
              fetch("/api/wallet", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(parsed),
              }).catch(() => {});
              return;
            }
          }
        } catch {}
        setWallet(serverW);
      }
    };

    const applyOrdersData = (serverOrders: CashbackOrderItem[]) => {
      if (Array.isArray(serverOrders)) {
        setOrders(serverOrders);
      }
    };

    const applyHistoryData = (serverHistory: WithdrawalItem[]) => {
      let localPending: WithdrawalItem[] = [];
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem("dealhoan_pending_withdrawals_" + user.id);
          if (raw) localPending = JSON.parse(raw);
        } catch {}
      }

      const existingIds = new Set(serverHistory.map((s) => s.id));
      const merged = [...serverHistory];
      for (const item of localPending) {
        if (!existingIds.has(item.id)) {
          if (item.status === "pending") {
            merged.push(item);
            existingIds.add(item.id);
          }
        }
      }
      merged.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setHistory(merged);
    };

    // 1. Cố gắng lấy toàn bộ dữ liệu trong 1 request duy nhất (rút ngắn thời gian tối đa)
    fetch("/api/wallet?full=1", { cache: "no-store", signal: controller.signal })
      .then((res) => { if (!res.ok) throw new Error("Full fetch failed"); return res.json(); })
      .then((data) => {
        if (cancelled) return;
        if (data.wallet) applyWalletData(data.wallet);
        if (Array.isArray(data.orders)) applyOrdersData(data.orders);
        if (Array.isArray(data.history)) applyHistoryData(data.history);
        clearTimeout(deadline);
        setLoading({ wallet: false, orders: false, history: false });
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback: Tải song song từng endpoint nếu unified endpoint gặp sự cố
        let remaining = 3;
        const finish = (key: "wallet" | "orders" | "history") => {
          if (--remaining === 0) clearTimeout(deadline);
          if (!cancelled) setLoading((prev) => ({ ...prev, [key]: false }));
        };
        const failed = (key: string) => {
          if (!cancelled) setLoadErrors((prev) => ({ ...prev, [key]: "Tải dữ liệu chưa thành công. Vui lòng thử lại." }));
        };

        fetch("/api/wallet", { cache: "no-store", signal: controller.signal })
          .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
          .then((data) => {
            if (!cancelled && data.wallet) applyWalletData(data.wallet);
          })
          .catch(() => failed("wallet"))
          .finally(() => finish("wallet"));

        fetch("/api/wallet/withdraw", { cache: "no-store", signal: controller.signal })
          .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
          .then((data) => {
            if (!cancelled && Array.isArray(data.history)) applyHistoryData(data.history);
          })
          .catch(() => failed("history"))
          .finally(() => finish("history"));

        fetch("/api/wallet/orders", { cache: "no-store", signal: controller.signal })
          .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
          .then((data) => {
            if (!cancelled && Array.isArray(data.orders)) applyOrdersData(data.orders);
          })
          .catch(() => failed("orders"))
          .finally(() => finish("orders"));
      });

    return () => {
      cancelled = true;
      clearTimeout(deadline);
      controller.abort();
    };
  }, [user.id, refreshKey]);

  // Tải thông tin chương trình giới thiệu của user
  useEffect(() => {
    let cancelled = false;
    fetch("/api/referral", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        setReferral(data as UserReferralSummary);
        if (typeof data.lockedBalance === "number") {
          setWallet((prev) => ({
            ...prev,
            locked_balance: data.lockedBalance,
          }));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReferralLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, refreshKey]);

  // Kiểm tra tài khoản ngân hàng đã sẵn sàng chưa
  const isBankReady = Boolean(wallet.bank_account_no && wallet.bank_name);

  // Số tiền parsed
  const parsedAmount = Number(withdrawAmount.replace(/\D/g, ""));

  // Hệ thống Validate nhiều Rule chặt chẽ cho số tiền rút
  const validateWithdrawal = (): { isValid: boolean; error?: string; hint?: string } => {
    if (!isBankReady) {
      return { isValid: false, error: "Vui lòng lưu thông tin ngân hàng trước khi rút tiền." };
    }
    if (wallet.balance < 10000) {
      return {
        isValid: false,
        error: `Số dư khả dụng (${formatVnd(wallet.balance)}) chưa đạt mức tối thiểu 10.000đ để rút.`,
      };
    }
    if (!withdrawAmount) {
      return {
        isValid: false,
        hint: `Số dư khả dụng: ${formatVnd(wallet.balance)} · Rút tối thiểu 10.000đ`,
      };
    }
    if (!parsedAmount || parsedAmount <= 0) {
      return { isValid: false, error: "Số tiền muốn rút không hợp lệ." };
    }
    if (parsedAmount < 10000) {
      return {
        isValid: false,
        error: "Số tiền rút tối thiểu là 10.000đ.",
      };
    }
    if (parsedAmount > wallet.balance) {
      return {
        isValid: false,
        error: `Số tiền rút (${formatVnd(parsedAmount)}) vượt quá số dư khả dụng (${formatVnd(wallet.balance)}).`,
      };
    }
    if (parsedAmount > 50000000) {
      return {
        isValid: false,
        error: "Số tiền rút tối đa mỗi lệnh là 50.000.000đ.",
      };
    }
    if (parsedAmount % 1000 !== 0) {
      return {
        isValid: false,
        error: "Số tiền rút phải là bội số của 1.000đ (Ví dụ: 10.000đ, 20.000đ, 50.000đ...).",
      };
    }
    return {
      isValid: true,
      hint: `✓ Hợp lệ · Số dư còn lại sau khi rút: ${formatVnd(wallet.balance - parsedAmount)}`,
    };
  };

  const amountValidation = validateWithdrawal();

  // Xử lý lưu ngân hàng chặt chẽ + lưu cả client và server
  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNo = accountNo.replace(/\D/g, "");
    const cleanName = accountName.trim().toUpperCase();

    if (!bankName) {
      return onNotify("⚠️ Vui lòng chọn ngân hàng!");
    }
    if (!cleanNo || cleanNo.length < 6 || cleanNo.length > 20) {
      return onNotify("⚠️ STK phải từ 6 - 20 số!");
    }
    if (!cleanName || cleanName.length < 3) {
      return onNotify("⚠️ Tên chủ tài khoản từ 3 ký tự!");
    }
    if (/[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(cleanName)) {
      return onNotify("⚠️ Tên tài khoản không chứa số/ký tự đặc biệt!");
    }

    // 1. Lưu ngay vào localStorage
    try {
      localStorage.setItem(
        "dealhoan_bank_info_" + user.id,
        JSON.stringify({
          bank_name: bankName,
          bank_account_no: cleanNo,
          bank_account_name: cleanName,
        })
      );
    } catch {}

    setAccountNo(cleanNo);
    setAccountName(cleanName);

    try {
      setSavingBank(true);
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_name: bankName,
          bank_account_no: cleanNo,
          bank_account_name: cleanName,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditingBank(false);
        setBankSavedSuccess(true);
        setTimeout(() => setBankSavedSuccess(false), 3000);
        onNotify("✅ Đã lưu tài khoản ngân hàng");
        setWallet((prev) => ({
          ...prev,
          bank_name: bankName,
          bank_account_no: cleanNo,
          bank_account_name: cleanName,
        }));
      } else {
        onNotify("⚠️ " + (data.error || "Không thể lưu thông tin"));
      }
    } catch {
      onNotify("✅ Đã lưu trên thiết bị");
      setWallet((prev) => ({
        ...prev,
        bank_name: bankName,
        bank_account_no: cleanNo,
        bank_account_name: cleanName,
      }));
    } finally {
      setSavingBank(false);
    }
  };

  // Xử lý rút tiền với multi-rule validation
  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawError("");

    if (!amountValidation.isValid) {
      setWithdrawError(amountValidation.error || "Số tiền rút không hợp lệ.");
      return;
    }

    try {
      setWithdrawing(true);
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsedAmount,
          bank_name: wallet.bank_name || bankName,
          bank_account_no: wallet.bank_account_no || accountNo,
          bank_account_name: wallet.bank_account_name || accountName,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        onNotify("🎉 Đã tạo yêu cầu rút tiền!");
        setWithdrawAmount("");
        setWallet((prev) => {
          const nextBalance = typeof data.newBalance === "number" ? data.newBalance : Math.max(0, prev.balance - parsedAmount);
          const nextWithdrawn = prev.total_withdrawn + parsedAmount;
          return {
            ...prev,
            balance: nextBalance,
            total_withdrawn: nextWithdrawn,
          };
        });
        if (data.request) {
          setHistory((prev) => [data.request, ...prev]);
          if (typeof window !== "undefined") {
            try {
              const raw = localStorage.getItem("dealhoan_pending_withdrawals_" + user.id);
              const list: WithdrawalItem[] = raw ? JSON.parse(raw) : [];
              const updated = [data.request, ...list.filter((x) => x.id !== data.request.id)];
              localStorage.setItem("dealhoan_pending_withdrawals_" + user.id, JSON.stringify(updated));
            } catch {}
          }
        }
        onNotify(`✓ Đã gửi yêu cầu rút ${formatVnd(parsedAmount)}. Tiền sẽ được chuyển trong 24–48h.`);
      } else {
        setWithdrawError(data.error || "Không thể tạo yêu cầu rút tiền.");
      }
    } catch {
      setWithdrawError("Lỗi kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setWithdrawing(false);
    }
  };

  const setPresetAmount = (val: number) => {
    setWithdrawError("");
    setWithdrawAmount(val.toString());
  };

  const refLink =
    referral?.refLink ||
    (typeof window !== "undefined" ? `${window.location.origin}/?ref=${refCode}` : `https://dealhoan.com/?ref=${refCode}`);

  const copyRefCode = () => {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(refCode);
      onNotify("✓ Đã copy mã giới thiệu: " + refCode);
    }
  };

  const copyRefLink = () => {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(refLink);
      onNotify("✓ Đã copy link giới thiệu!");
    }
  };

  const shareRefLink = async () => {
    const rewardText = formatVnd(referral?.settings?.refereeReward ?? 10000);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Nhận hoàn tiền Shopee cùng DealHoàn",
          text: `Đăng ký DealHoàn qua link của mình để nhận thưởng ${rewardText} khi mua sắm hoàn tiền nhé!`,
          url: refLink,
        });
        return;
      } catch {
        // User cancelled or share unsupported -> fallback to copy
      }
    }
    copyRefLink();
  };

  const handleClaimManualRef = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaimRefError("");
    const code = manualRefInput.trim();
    if (!code) {
      setClaimRefError("Vui lòng nhập mã giới thiệu của bạn bè.");
      return;
    }
    try {
      setClaimingRef(true);
      const { deviceId, fingerprintHash } = await collectDeviceIdentity();
      const res = await fetch("/api/referral/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refCode: code, deviceId, fingerprintHash }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setManualRefInput("");
        onNotify("🎉 " + (data.message || "Áp dụng mã giới thiệu thành công!"));
        setRefreshKey((k) => k + 1);
      } else {
        setClaimRefError(data.error || "Không thể áp dụng mã giới thiệu.");
      }
    } catch {
      setClaimRefError("Lỗi kết nối máy chủ. Vui lòng thử lại sau.");
    } finally {
      setClaimingRef(false);
    }
  };

  const daysRemaining = (iso: string) => {
    const diff = new Date(iso).getTime() - nowMs;
    if (isNaN(diff) || diff <= 0) return 0;
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  };

  const referralStatusLabel = (status: string) =>
    status === "unlocked"
      ? "Đã mở khóa"
      : status === "review_pending"
      ? "Chờ duyệt"
      : status === "expired"
      ? "Hết hạn"
      : status === "revoked"
      ? "Đã thu hồi"
      : "Đang khóa";

  const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Tài khoản của bạn";

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const tabs = [
    { key: "orders", label: "Đơn hoàn tiền", Icon: ShoppingBag },
    { key: "referral", label: "Giới thiệu", Icon: Gift },
    { key: "withdraw", label: "Rút tiền", Icon: CreditCard },
  ] as const;
  const effectiveLockedBalance =
    typeof referral?.lockedBalance === "number"
      ? referral.lockedBalance
      : Number(wallet.locked_balance || 0);
  const showLockedStat = effectiveLockedBalance > 0;
  const statusLabel = (status: string) =>
    status === "completed"
      ? "Đã hoàn tất"
      : status === "pending"
      ? "Chờ duyệt"
      : status === "tracking"
      ? "Chờ duyệt"
      : "Bị từ chối";
  const busyWallet = loading.wallet || Boolean(loadErrors.wallet);
  const switchTab = (key: typeof activeTab) => { setActiveTab(key); document.getElementById(`${tabId}-${key}`)?.focus(); };
  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      const menu = dialogRef.current?.querySelector<HTMLDetailsElement>("details[open]");
      if (menu) { menu.open = false; menu.querySelector("summary")?.focus(); return; }
      onClose(); return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') || []).filter(el => el.getClientRects().length > 0);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };


  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.dialog} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onDialogKeyDown} onClick={event => event.stopPropagation()}>
        <header className={s.header}>
          <div className={s.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/deal-hoan-mark.png" alt="" width="36" height="36" />
            <span>DealHoàn</span>
          </div>
          <h2 id={titleId}>Ví hoàn tiền</h2>
          <details className={s.profile}>
            <summary><span className={s.avatar}>{avatarUrl ? <Image unoptimized src={avatarUrl} alt="" width={32} height={32} /> : getInitials(displayName)}</span><span className={s.profileLabel}>Tài khoản của bạn</span><CaretDown size={16} /></summary>
            <div className={s.accountMenu}>
              <strong>{displayName}</strong><span className={s.email}>{user.email}</span>
              <button type="button" onClick={copyRefCode}><Copy size={18} /> Mã mời: {refCode}</button>
              <button type="button" onClick={onSignOut}><SignOut size={18} /> Đăng xuất</button>
            </div>
          </details>
          <button type="button" className={s.close} onClick={onClose} aria-label="Đóng ví hoàn tiền"><X size={20} /></button>
        </header>
        <div className={`${s.stats} ${showLockedStat ? s.statsThree : ""}`} aria-label="Tổng quan ví" aria-busy={loading.wallet}>
          <div className={s.stat}>
            <Clock size={27} />
            <div>
              <span>Chờ duyệt</span>
              <strong data-length={formatVnd(wallet.pending_balance).length > 9 ? "long" : formatVnd(wallet.pending_balance).length > 6 ? "medium" : "short"}>
                {busyWallet ? "—" : formatVnd(wallet.pending_balance)}
              </strong>
            </div>
          </div>
          {showLockedStat && (
            <button
              type="button"
              className={`${s.stat} ${s.lockedStat}`}
              onClick={() => switchTab("referral")}
              title="Xem điều kiện mở khóa thưởng giới thiệu"
            >
              <LockKey size={27} />
              <div>
                <span>Đang khóa</span>
                <strong data-length={formatVnd(effectiveLockedBalance).length > 9 ? "long" : formatVnd(effectiveLockedBalance).length > 6 ? "medium" : "short"}>
                  {busyWallet ? "—" : formatVnd(effectiveLockedBalance)}
                </strong>
                <span className={s.lockedHint}>Xem tiến độ mở khóa →</span>
              </div>
            </button>
          )}
          <div className={`${s.stat} ${s.available}`}>
            <Wallet size={27} />
            <div>
              <span>Có thể rút</span>
              <strong data-length={formatVnd(wallet.balance).length > 9 ? "long" : formatVnd(wallet.balance).length > 6 ? "medium" : "short"}>
                {busyWallet ? "—" : formatVnd(wallet.balance)}
              </strong>
            </div>
          </div>
        </div>
        <div className={s.tabs} role="tablist" aria-label="Ví hoàn tiền" onKeyDown={event => {
          const index = tabs.findIndex(tab => tab.key === activeTab);
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
          if (next >= 0) { event.preventDefault(); switchTab(tabs[next].key); document.getElementById(`${tabId}-${tabs[next].key}`)?.focus(); }
        }}>
          {tabs.map(({key, label, Icon}) => <button key={key} type="button" role="tab" id={`${tabId}-${key}`} aria-controls={`${tabId}-panel`} aria-selected={activeTab === key} tabIndex={activeTab === key ? 0 : -1} className={activeTab === key ? s.active : ""} onClick={() => switchTab(key)}><Icon size={20} /><span>{label}</span></button>)}
        </div>
        <div className={s.content} role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${activeTab}`} tabIndex={0}>
          {(loadErrors.wallet || loadErrors[activeTab]) && <div className={s.error} role="alert"><Info size={18} /><span>Tải dữ liệu chưa thành công. Vui lòng thử lại.</span><button type="button" onClick={() => { setLoading({ wallet: true, orders: true, history: true }); setLoadErrors({}); setRefreshKey(key => key + 1); }}>Thử lại</button></div>}
          {activeTab === "orders" && <>
            {loading.orders && orders.length === 0 ? (
              <p className={s.loading} role="status">Đang tải đơn hoàn tiền…</p>
            ) : loadErrors.orders && orders.length === 0 ? null : orders.length === 0 ? (
              <div className={s.empty}>
                <span className={s.emptyIcon}><ShoppingBag size={36} weight="light" /></span>
                <h3>Chưa có đơn hoàn tiền</h3>
                <p className={s.emptyHint}>
                  Đơn hàng của bạn sẽ được Shopee cập nhật sau 9h hàng ngày
                </p>
              </div>
            ) : (
              <div className={s.list}>
                {orders.map((order) => {
                  const cleanedTitle = cleanProductTitle(order.product_name || "");
                  const userNote = cleanUserNote(order.note, order.status);
                  return (
                    <article className={s.record} key={order.id}>
                      <div className={s.recordBody}>
                        <div className={s.recordLeft}>
                          <h4 className={s.productTitle} title={order.product_name || ""}>
                            {cleanedTitle}
                          </h4>
                          <div className={s.recordMeta}>
                            <span>{order.platform}</span>
                            <span className={s.dot}>·</span>
                            <time>{formatDateShort(order.ordered_at)}</time>
                            <span className={s.dot}>·</span>
                            <span>Đơn {formatVnd(order.order_value)}</span>
                          </div>
                          {userNote && (
                            <div className={s.userNote}>
                              <Clock size={11} weight="bold" />
                              <span>{userNote}</span>
                            </div>
                          )}
                        </div>

                        <div className={s.recordRight}>
                          <span className={s.cashbackAmount}>
                            +{formatVnd(order.cashback_amount)}
                          </span>
                          <span className={s.status} data-status={order.status}>
                            {statusLabel(order.status)}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}

                <div className={s.bottomHelp}>
                  <Info size={13} weight="bold" />
                  <span>Đơn mới thường được cập nhật tự động sau 9h sáng mỗi ngày</span>
                </div>
              </div>
            )}
          </>}
          {activeTab === "referral" && (() => {
            const referrerReward = referral?.settings?.referrerReward ?? 10000;
            const refereeReward = referral?.settings?.refereeReward ?? 10000;
            const referrerMin = referral?.settings?.referrerMinQualifyingCashback ?? 50000;
            const refereeMin = referral?.settings?.refereeMinQualifyingCashback ?? 50000;
            const expiryDays = referral?.settings?.expiryDays ?? 90;
            const outgoing = referral?.outgoing ?? [];
            const incoming = referral?.incoming ?? null;
            const hasReferralActivity = Boolean(
              referral &&
                (referral.totalInvited > 0 ||
                  incoming ||
                  effectiveLockedBalance > 0 ||
                  referral.totalUnlockedBonus > 0)
            );
            const isIncomingActive = Boolean(
              incoming && (incoming.status === "locked" || incoming.status === "review_pending")
            );
            const hasActiveReferral =
              isIncomingActive ||
              outgoing.some((i) => i.status === "locked" || i.status === "review_pending");
            const isActiveRefereeOnly = isIncomingActive && outgoing.length === 0;
            const ownTarget = isActiveRefereeOnly
              ? incoming?.refereeTarget ?? refereeMin
              : referrerMin;
            const ownCurrent = referral?.ownQualifyingCashback ?? 0;
            const ownPct = ownTarget > 0 ? Math.min(100, Math.round((ownCurrent / ownTarget) * 100)) : 100;
            const ownDone = ownCurrent >= ownTarget;

            return (
              <div>
                {referral && !referral.settings.enabled && (
                  <div className={s.orderNotice} role="status">
                    <Info size={16} weight="bold" />
                    <span>Chương trình tạm dừng nhận lượt mới. Thưởng trước đó vẫn giữ nguyên.</span>
                  </div>
                )}

                <h3 className={s.sectionTitle}>Mời bạn bè, nhận {formatVnd(referrerReward)}</h3>
                <p className={s.refSub}>
                  {referrerReward === refereeReward && referrerMin === refereeMin
                    ? `Mỗi người nhận ${formatVnd(referrerReward)} khi cùng đạt ${formatVnd(refereeMin)} tiền hoàn trong ${expiryDays} ngày.`
                    : `Bạn nhận ${formatVnd(referrerReward)}, bạn bè nhận ${formatVnd(refereeReward)} khi đạt mốc hoàn tiền trong ${expiryDays} ngày.`}
                </p>

                <div className={s.refLinkBox}>
                  <input
                    type="text"
                    readOnly
                    value={refLink}
                    aria-label="Link giới thiệu của bạn"
                    className={s.refLinkInput}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <div className={s.refLinkActions}>
                    <button type="button" className={s.refBtnPrimary} onClick={copyRefLink}>
                      <Copy size={15} weight="bold" /> Sao chép
                    </button>
                    <button type="button" className={s.refBtnSecondary} onClick={shareRefLink}>
                      <ShareNetwork size={15} weight="bold" /> Chia sẻ
                    </button>
                  </div>
                </div>

                {referral?.canEnterManualCode && (
                  <form className={s.refManualForm} onSubmit={handleClaimManualRef}>
                    <div className={s.refManualRow}>
                      <input
                        id="manual-ref-code"
                        type="text"
                        aria-label="Nhập mã giới thiệu"
                        value={manualRefInput}
                        onChange={(e) => {
                          setManualRefInput(e.target.value);
                          setClaimRefError("");
                        }}
                        placeholder="Có mã giới thiệu? Nhập tại đây (VD: u_1a2b3c4d)"
                        disabled={claimingRef}
                      />
                      <button type="submit" className={s.refBtnSecondary} disabled={claimingRef}>
                        {claimingRef ? "Đang kiểm tra…" : "Áp dụng"}
                      </button>
                    </div>
                    {claimRefError && <span className={s.refErrorText}>{claimRefError}</span>}
                  </form>
                )}

                {hasReferralActivity && (
                  <div className={s.refSummaryStrip}>
                    <div>
                      <span>Đã mời</span>
                      <strong>{referral?.totalInvited ?? 0}</strong>
                    </div>
                    <div className={effectiveLockedBalance > 0 ? s.amber : ""}>
                      <span>Đang khóa</span>
                      <strong>{formatVnd(effectiveLockedBalance)}</strong>
                    </div>
                    <div className={(referral?.totalUnlockedBonus ?? 0) > 0 ? s.green : ""}>
                      <span>Đã mở khóa</span>
                      <strong>{formatVnd(referral?.totalUnlockedBonus ?? 0)}</strong>
                    </div>
                  </div>
                )}

                {hasActiveReferral && (
                  <div className={s.refProgressCard}>
                    <div className={s.refProgressHead}>
                      <span>Mốc hoàn tiền của bạn</span>
                      <strong className={ownDone ? s.refDone : s.refPending}>
                        {ownDone ? "✓ Đã đạt" : `${formatVnd(ownCurrent)} / ${formatVnd(ownTarget)}`}
                      </strong>
                    </div>
                    <div className={s.refProgressBar}>
                      <div
                        className={`${s.refProgressFill} ${ownDone ? s.refProgressFillDone : ""}`}
                        style={{ width: `${ownPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {incoming && (
                  <>
                    <h4 className={s.refSectionHead}>
                      <span>Được mời bởi</span>
                      <span className={s.status} data-status={incoming.status}>
                        {referralStatusLabel(incoming.status)}
                      </span>
                    </h4>
                    <article className={s.record}>
                      <div className={s.recordBody}>
                        <div className={s.recordLeft}>
                          <h4 className={s.productTitle}>{incoming.referrerLabel}</h4>
                          <div className={s.recordMeta}>
                            <span>
                              {incoming.status === "unlocked"
                                ? `Mở khóa ${formatDateShort(incoming.unlockedAt || incoming.createdAt)}`
                                : incoming.status === "locked"
                                ? `Còn ${daysRemaining(incoming.expiresAt)} ngày`
                                : formatDateShort(incoming.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className={s.recordRight}>
                          <span className={s.cashbackAmount}>+{formatVnd(incoming.rewardAmount)}</span>
                        </div>
                      </div>
                      {isIncomingActive && (
                        <div className={s.refItemMeta}>
                          <div className={s.refMiniProgressRow}>
                            <span>Bạn</span>
                            <div className={s.refProgressBar}>
                              <div
                                className={`${s.refProgressFill} ${
                                  incoming.refereeQualifying >= incoming.refereeTarget ? s.refProgressFillDone : ""
                                }`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    incoming.refereeTarget > 0
                                      ? Math.round((incoming.refereeQualifying / incoming.refereeTarget) * 100)
                                      : 100
                                  )}%`,
                                }}
                              />
                            </div>
                            <span>
                              {formatVnd(incoming.refereeQualifying)} / {formatVnd(incoming.refereeTarget)}
                            </span>
                          </div>
                          <div className={s.refMiniProgressRow}>
                            <span>Người mời</span>
                            <div className={s.refProgressBar}>
                              <div
                                className={`${s.refProgressFill} ${
                                  incoming.referrerQualifying >= incoming.referrerTarget ? s.refProgressFillDone : ""
                                }`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    incoming.referrerTarget > 0
                                      ? Math.round((incoming.referrerQualifying / incoming.referrerTarget) * 100)
                                      : 100
                                  )}%`,
                                }}
                              />
                            </div>
                            <span>
                              {formatVnd(incoming.referrerQualifying)} / {formatVnd(incoming.referrerTarget)}
                            </span>
                          </div>
                        </div>
                      )}
                    </article>
                  </>
                )}

                {referralLoading && !referral ? (
                  <p className={s.loading} role="status">Đang tải…</p>
                ) : outgoing.length === 0 ? (
                  !incoming && (
                    <div className={s.empty}>
                      <span className={s.emptyIcon}><Gift size={36} weight="light" /></span>
                      <h3>Chưa có bạn bè nào</h3>
                      <p className={s.emptyHint}>
                        Gửi link ở trên qua Zalo hoặc Messenger để mời bạn bè
                      </p>
                    </div>
                  )
                ) : (
                  <>
                    <h4 className={s.refSectionHead}>
                      <span>Bạn bè đã mời ({outgoing.length})</span>
                    </h4>
                    <div className={s.list}>
                      {outgoing.map((item) => {
                        const isItemActive = item.status === "locked" || item.status === "review_pending";
                        const bDone = item.refereeQualifying >= item.refereeTarget;
                        const bPct =
                          item.refereeTarget > 0
                            ? Math.min(100, Math.round((item.refereeQualifying / item.refereeTarget) * 100))
                            : 100;
                        return (
                          <article className={s.record} key={item.id}>
                            <div className={s.recordBody}>
                              <div className={s.recordLeft}>
                                <h4 className={s.productTitle}>{item.refereeLabel}</h4>
                                <div className={s.recordMeta}>
                                  <span>{formatDateShort(item.createdAt)}</span>
                                  <span className={s.dot}>·</span>
                                  <span>
                                    {item.status === "unlocked"
                                      ? `Mở khóa ${formatDateShort(item.unlockedAt || item.createdAt)}`
                                      : item.status === "locked"
                                      ? `Còn ${daysRemaining(item.expiresAt)} ngày`
                                      : referralStatusLabel(item.status)}
                                  </span>
                                </div>
                              </div>
                              <div className={s.recordRight}>
                                <span className={s.cashbackAmount}>+{formatVnd(item.rewardAmount)}</span>
                                <span className={s.status} data-status={item.status}>
                                  {referralStatusLabel(item.status)}
                                </span>
                              </div>
                            </div>
                            {isItemActive && (
                              <div className={s.refItemMeta}>
                                <div className={s.refMiniProgressRow}>
                                  <span>Bạn bè</span>
                                  <div className={s.refProgressBar}>
                                    <div
                                      className={`${s.refProgressFill} ${bDone ? s.refProgressFillDone : ""}`}
                                      style={{ width: `${bPct}%` }}
                                    />
                                  </div>
                                  <span>
                                    {formatVnd(item.refereeQualifying)} / {formatVnd(item.refereeTarget)}
                                  </span>
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
          {activeTab === "withdraw" && <>
            <h3 className={s.sectionTitle}>Rút tiền về ngân hàng</h3>
            {loading.wallet ? <p className={s.loading} role="status">Đang tải thông tin ví…</p> : <>
              {isBankReady && !editingBank ? <div className={s.bankSummary}><span className={s.bankIcon}><Bank size={24} /></span><strong>{wallet.bank_name}</strong><span className={s.masked}>•••• {wallet.bank_account_no.slice(-4)}</span><span className={s.saved}><CheckCircle size={18} />{bankSavedSuccess ? "Đã cập nhật" : "Đã lưu"}</span><button type="button" onClick={() => setEditingBank(true)} aria-expanded={false}>Chỉnh sửa</button></div> : <form onSubmit={async event => { await handleSaveBank(event); }} className={s.bankForm}>
                <div className={s.bankFormHeader}>
                  <h4>{isBankReady ? "Chỉnh sửa tài khoản nhận" : "Thêm tài khoản nhận tiền"}</h4>
                  {isBankReady && (
                    <button
                      type="button"
                      className={s.bankCancelBtn}
                      disabled={savingBank}
                      onClick={() => {
                        setBankName(wallet.bank_name);
                        setAccountNo(wallet.bank_account_no);
                        setAccountName(wallet.bank_account_name);
                        setEditingBank(false);
                      }}
                    >
                      ✕ Đóng
                    </button>
                  )}
                </div>
                <div className={s.bankGrid}>
                  <label className={s.bankField}>
                    Ngân hàng
                    <select value={bankName} onChange={event => setBankName(event.target.value)} disabled={savingBank}>
                      {VN_BANKS.map(bank => <option key={bank}>{bank}</option>)}
                    </select>
                  </label>
                  <label className={s.bankField}>
                    Số tài khoản
                    <input
                      required
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="Nhập số tài khoản"
                      value={accountNo}
                      onChange={event => setAccountNo(event.target.value.replace(/\D/g, ""))}
                      disabled={savingBank}
                    />
                  </label>
                  <label className={s.bankField}>
                    Tên chủ tài khoản
                    <input
                      required
                      autoComplete="name"
                      placeholder="Tên in hoa không dấu"
                      value={accountName}
                      onChange={event => setAccountName(event.target.value)}
                      disabled={savingBank}
                    />
                  </label>
                  <div className={s.bankActions}>
                    {isBankReady && (
                      <button
                        type="button"
                        className={s.bankSecondaryBtn}
                        disabled={savingBank}
                        onClick={() => {
                          setBankName(wallet.bank_name);
                          setAccountNo(wallet.bank_account_no);
                          setAccountName(wallet.bank_account_name);
                          setEditingBank(false);
                        }}
                      >
                        Hủy
                      </button>
                    )}
                    <button
                      type="submit"
                      className={s.bankPrimaryBtn}
                      disabled={savingBank || Boolean(loadErrors.wallet)}
                    >
                      {savingBank ? "Đang lưu…" : "Lưu tài khoản"}
                    </button>
                  </div>
                </div>
              </form>}
              <form className={s.withdrawForm} onSubmit={handleWithdraw}>
                <div className={s.amountLabel}><label htmlFor={`${tabId}-amount`}>Số tiền muốn rút</label><span>Tối thiểu 10.000đ</span></div>
                <div className={s.amountInput}><input id={`${tabId}-amount`} inputMode="numeric" autoComplete="off" placeholder="Nhập số tiền" value={withdrawAmount ? Number(withdrawAmount).toLocaleString("vi-VN") : ""} disabled={busyWallet || withdrawing} aria-describedby={withdrawError ? `${tabId}-feedback` : undefined} onChange={event => { setWithdrawAmount(event.target.value.replace(/\D/g, "")); setWithdrawError(""); }} /><span>đ</span></div>
                <div className={s.presets}>
                  {[50000, 100000].map(amount => (
                    <button
                      type="button"
                      key={amount}
                      disabled={busyWallet || withdrawing || wallet.balance < amount}
                      onClick={() => setPresetAmount(amount)}
                    >
                      {formatVnd(amount)}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={busyWallet || withdrawing || wallet.balance < 10000}
                    onClick={() => setPresetAmount(Math.floor(Math.min(wallet.balance, 50000000) / 1000) * 1000)}
                  >
                    Tất cả
                  </button>
                </div>
                {(withdrawError || (withdrawAmount && amountValidation.error)) && (
                  <p id={`${tabId}-feedback`} className={`${s.feedback} ${s.feedbackError}`} aria-live="polite">
                    <Info size={17} /><span>{withdrawError || amountValidation.error}</span>
                  </p>
                )}
                {isBankReady && Number(withdrawAmount) >= 10000 && (
                  <div style={{ marginTop: 10, textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => setShowVietQr(!showVietQr)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "5px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#15803d",
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        borderRadius: 8,
                        cursor: "pointer",
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
                        <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
                        <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
                        <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
                      </svg>
                      <span>{showVietQr ? "Ẩn mã VietQR" : "Tạo mã VietQR kèm số tiền rút"}</span>
                    </button>
                    {showVietQr && (
                      <div style={{ marginTop: 10, padding: 12, background: "#ffffff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://img.vietqr.io/image/${getVietQrBankCode(wallet.bank_name || bankName)}-${(wallet.bank_account_no || accountNo).replace(/\s+/g, "")}-compact2.png?amount=${Number(withdrawAmount)}&addInfo=DealHoan%20rut%20tien%20${refCode}`}
                          alt="Mã VietQR"
                          style={{ width: 200, height: "auto", margin: "0 auto", display: "block", borderRadius: 6 }}
                        />
                        <div style={{ fontSize: 11, color: "#15803d", fontWeight: 700, marginTop: 6 }}>
                          Mã VietQR kèm số tiền: {formatVnd(Number(withdrawAmount))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <button type="submit" className={s.primary} disabled={busyWallet || withdrawing || !amountValidation.isValid}>{withdrawing ? "Đang gửi yêu cầu…" : "Rút tiền"}</button>

                {history.length > 0 && (
                  <div style={{ marginTop: 22 }}>
                    <h4 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Lệnh rút gần đây</h4>
                    <div className={s.list}>
                      {history.slice(0, 3).map((item) => (
                        <article className={s.record} key={item.id}>
                          <div className={s.recordTop}>
                            <strong>{formatVnd(item.amount)}</strong>
                            <span className={s.status} data-status={item.status}>
                              {item.status === "completed" ? "Đã chuyển" : item.status === "pending" ? "Chờ xử lý" : "Bị từ chối"}
                            </span>
                          </div>
                          <div className={s.recordMeta}>
                            <span>{item.bank_name} · •••• {item.bank_account_no.slice(-4)}</span>
                            <time>{formatDate(item.created_at)}</time>
                          </div>
                          {item.note && !/napas/i.test(item.note) && <p>{item.note}</p>}
                          {item.bank_account_no && (
                            <div style={{ marginTop: 6 }}>
                              <button
                                type="button"
                                onClick={() => setActiveQrItem(activeQrItem?.id === item.id ? null : item)}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: "#15803d",
                                  background: "#f0fdf4",
                                  border: "1px solid #bbf7d0",
                                  padding: "3px 8px",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                }}
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
                                  <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
                                  <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
                                  <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
                                </svg>
                                <span>{activeQrItem?.id === item.id ? "Ẩn mã QR" : "Mã VietQR rút tiền"}</span>
                              </button>
                              {activeQrItem?.id === item.id && (
                                <div style={{ marginTop: 8, textAlign: "center", padding: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={`https://img.vietqr.io/image/${getVietQrBankCode(item.bank_name)}-${item.bank_account_no.replace(/\s+/g, "")}-compact2.png?amount=${item.amount}&addInfo=DealHoan%20rut%20tien%20${refCode}`}
                                    alt="Mã VietQR"
                                    style={{ width: 180, height: "auto", margin: "0 auto", display: "block", borderRadius: 6 }}
                                  />
                                  <div style={{ fontSize: 11, color: "#15803d", fontWeight: 700, marginTop: 4 }}>
                                    Số tiền: {formatVnd(item.amount)}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            </>}
          </>}
        </div>
        <footer className={s.footer}><Link href="/#contact" onClick={onClose}><Question size={19} /> Cần hỗ trợ?</Link></footer>
      </div>
    </div>
  );
}
