"use client";

import React, { useState, useEffect, useRef, useId } from "react";
import Link from "next/link";
import Image from "next/image";
import { Wallet, Clock, Bank, ShoppingBag, Receipt, CreditCard, X, CaretDown, ArrowRight, Question, CheckCircle, Info, SignOut, Copy } from "@phosphor-icons/react";
import s from "./account-wallet.module.css";
import type { User } from "@supabase/supabase-js";

export interface WalletData {
  balance: number;
  pending_balance: number;
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
  status: "pending" | "completed" | "rejected";
  note?: string | null;
  ordered_at: string;
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
  const [activeTab, setActiveTab] = useState<"orders" | "withdraw" | "history">("orders");
  const [wallet, setWallet] = useState<WalletData>(() => {
    let savedBank = { bank_name: "", bank_account_no: "", bank_account_name: "" };
    let savedStats = {
      balance: initialBalance ?? 0,
      pending_balance: 0,
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
        const storedWallet = localStorage.getItem("dealhoan_wallet_cache_" + user.id);
        if (storedWallet) {
          const parsed = JSON.parse(storedWallet);
          if (typeof parsed.balance === "number" && initialBalance === undefined) savedStats.balance = parsed.balance;
          if (typeof parsed.pending_balance === "number") savedStats.pending_balance = parsed.pending_balance;
          if (typeof parsed.total_withdrawn === "number") savedStats.total_withdrawn = parsed.total_withdrawn;
        }
      } catch {}
    }
    return {
      ...savedStats,
      ...savedBank,
    };
  });
  const [history, setHistory] = useState<WithdrawalItem[]>([]);
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

  const [editingBank, setEditingBank] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState({ wallet: true, orders: true, history: true });
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
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
      try {
        localStorage.setItem(
          "dealhoan_wallet_cache_" + user.id,
          JSON.stringify({
            balance: serverW.balance,
            pending_balance: serverW.pending_balance,
            total_withdrawn: serverW.total_withdrawn,
          })
        );
      } catch {}
    };

    // 1. Cố gắng lấy toàn bộ dữ liệu trong 1 request duy nhất (rút ngắn thời gian tối đa)
    fetch("/api/wallet?full=1", { cache: "no-store", signal: controller.signal })
      .then((res) => { if (!res.ok) throw new Error("Full fetch failed"); return res.json(); })
      .then((data) => {
        if (cancelled) return;
        if (data.wallet) applyWalletData(data.wallet);
        if (Array.isArray(data.orders)) setOrders(data.orders);
        if (Array.isArray(data.history)) setHistory(data.history);
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
            if (!cancelled && Array.isArray(data.history)) setHistory(data.history);
          })
          .catch(() => failed("history"))
          .finally(() => finish("history"));

        fetch("/api/wallet/orders", { cache: "no-store", signal: controller.signal })
          .then((res) => { if (!res.ok) throw new Error(); return res.json(); })
          .then((data) => {
            if (!cancelled && Array.isArray(data.orders)) setOrders(data.orders);
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

  // Kiểm tra lệnh rút đang chờ xử lý
  const pendingWithdrawal = history.find((h) => h.status === "pending");
  const pendingWithdrawalTotal = history
    .filter((h) => h.status === "pending")
    .reduce((sum, h) => sum + (Number(h.amount) || 0), 0);

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
          if (typeof window !== "undefined") {
            try {
              const raw = localStorage.getItem("dealhoan_admin_balance_overrides");
              const map = raw ? JSON.parse(raw) : {};
              map[user.id] = {
                balance: nextBalance,
                pendingBalance: prev.pending_balance,
                updatedAt: Date.now(),
              };
              map["usr_dh_001"] = {
                balance: nextBalance,
                pendingBalance: prev.pending_balance,
                updatedAt: Date.now(),
              };
              localStorage.setItem("dealhoan_admin_balance_overrides", JSON.stringify(map));
            } catch {}
          }
          return {
            ...prev,
            balance: nextBalance,
            total_withdrawn: nextWithdrawn,
          };
        });
        if (data.request) {
          setHistory((prev) => [data.request, ...prev]);
        }
        setActiveTab("history");
        document.getElementById(`${tabId}-history`)?.focus();
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

  const copyRefCode = () => {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(refCode);
      onNotify("✓ Đã copy mã: " + refCode);
    }
  };

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
    { key: "withdraw", label: "Rút tiền", Icon: CreditCard },
    { key: "history", label: "Lịch sử rút", Icon: Receipt },
  ] as const;
  const statusLabel = (status: string) => status === "completed" ? "Đã hoàn tất" : status === "pending" ? "Chờ duyệt" : "Bị từ chối";
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
              {/* Tạm thời ẩn mã giới thiệu */}
              {false && <button type="button" onClick={copyRefCode}><Copy size={18} /> Mã: {refCode}</button>}
              <button type="button" onClick={onSignOut}><SignOut size={18} /> Đăng xuất tài khoản</button>
            </div>
          </details>
          <button type="button" className={s.close} onClick={onClose} aria-label="Đóng ví hoàn tiền"><X size={20} /></button>
        </header>
        <div className={s.stats} aria-label="Tổng quan ví" aria-busy={loading.wallet}>
          {[
            { label: "Chờ nền tảng duyệt", value: wallet.pending_balance, Icon: Clock },
            { label: "Có thể rút", value: wallet.balance, Icon: Wallet, isAvailable: true },
            { label: "Đã nhận", value: wallet.total_withdrawn, Icon: Bank },
          ].map(({ label, value, Icon, isAvailable }) => (
            <div className={`${s.stat} ${isAvailable ? s.available : ""}`} key={label}>
              <Icon size={27} />
              <div>
                <span>{label}</span>
                <strong data-length={formatVnd(value).length > 9 ? "long" : formatVnd(value).length > 6 ? "medium" : "short"}>
                  {busyWallet ? "—" : formatVnd(value)}
                </strong>
              </div>
            </div>
          ))}
        </div>
        <div className={s.tabs} role="tablist" aria-label="Ví hoàn tiền" onKeyDown={event => {
          const index = tabs.findIndex(tab => tab.key === activeTab);
          const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : -1;
          if (next >= 0) { event.preventDefault(); switchTab(tabs[next].key); document.getElementById(`${tabId}-${tabs[next].key}`)?.focus(); }
        }}>
          {tabs.map(({key, label, Icon}) => <button key={key} type="button" role="tab" id={`${tabId}-${key}`} aria-controls={`${tabId}-panel`} aria-selected={activeTab === key} tabIndex={activeTab === key ? 0 : -1} className={activeTab === key ? s.active : ""} onClick={() => switchTab(key)}><Icon size={20} /><span>{label}</span></button>)}
        </div>
        <div className={s.content} role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${activeTab}`} tabIndex={0}>
          {(loadErrors.wallet || loadErrors[activeTab === "withdraw" ? "history" : activeTab]) && <div className={s.error} role="alert"><Info size={18} /><span>Tải dữ liệu chưa thành công. Vui lòng thử lại.</span><button type="button" onClick={() => { setLoading({ wallet: true, orders: true, history: true }); setLoadErrors({}); setRefreshKey(key => key + 1); }}>Thử lại</button></div>}
          {activeTab === "orders" && <>
            {loading.orders ? <p className={s.loading} role="status">Đang tải đơn hoàn tiền…</p> : loadErrors.orders ? null : orders.length === 0 ? <div className={s.empty}>
              <span className={s.emptyIcon}><ShoppingBag size={36} weight="light" /></span><h3>Chưa có đơn hoàn tiền</h3>
              <Link href="/#deals" onClick={onClose} className={s.primary}>Tìm sản phẩm nhận hoàn <ArrowRight size={19} /></Link>
            </div> : <div className={s.list}>{orders.map(order => <article className={s.record} key={order.id}>
              <div className={s.recordTop}><span>{order.platform} · #{order.order_id}</span><span className={s.status} data-status={order.status}>{statusLabel(order.status)}</span></div>
              <div className={s.recordMain}><strong>{order.product_name || "Sản phẩm mua qua DealHoàn"}</strong><b>+{formatVnd(order.cashback_amount)}</b></div>
              <div className={s.recordMeta}><span>Giá trị đơn: {formatVnd(order.order_value)}</span><time>{formatDate(order.ordered_at)}</time></div>{order.note && <p>{order.note}</p>}
            </article>)}</div>}

          </>}
          {activeTab === "withdraw" && <>
            <h3 className={s.sectionTitle}>Rút tiền về ngân hàng</h3>
            {loading.wallet ? <p className={s.loading} role="status">Đang tải thông tin ví…</p> : <>
              {isBankReady && !editingBank ? <div className={s.bankSummary}><span className={s.bankIcon}><Bank size={24} /></span><strong>{wallet.bank_name}</strong><span className={s.masked}>•••• {wallet.bank_account_no.slice(-4)}</span><span className={s.saved}><CheckCircle size={18} />{bankSavedSuccess ? "Đã cập nhật" : "Đã lưu"}</span><button type="button" onClick={() => setEditingBank(true)} aria-expanded={false}>Chỉnh sửa</button></div> : <form onSubmit={async event => { await handleSaveBank(event); }} className={s.bankForm}>
                <h4>{isBankReady ? "Chỉnh sửa tài khoản nhận" : "Thêm tài khoản nhận tiền"}</h4>
                <label>Ngân hàng<select value={bankName} onChange={event => setBankName(event.target.value)} disabled={savingBank}>{VN_BANKS.map(bank => <option key={bank}>{bank}</option>)}</select></label>
                <div className={s.formRow}><label>Số tài khoản<input required inputMode="numeric" autoComplete="off" value={accountNo} onChange={event => setAccountNo(event.target.value.replace(/\D/g, ""))} disabled={savingBank} /></label><label>Tên chủ tài khoản<input required autoComplete="name" value={accountName} onChange={event => setAccountName(event.target.value)} disabled={savingBank} /></label></div>
                <div className={s.actions}>{isBankReady && <button type="button" className={s.secondary} disabled={savingBank} onClick={() => { setBankName(wallet.bank_name); setAccountNo(wallet.bank_account_no); setAccountName(wallet.bank_account_name); setEditingBank(false); }}>Hủy</button>}<button type="submit" className={s.primary} disabled={savingBank || Boolean(loadErrors.wallet)}>{savingBank ? "Đang lưu…" : "Lưu tài khoản"}</button></div>
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
                <button type="submit" className={s.primary} disabled={busyWallet || loading.history || Boolean(loadErrors.history) || withdrawing || !amountValidation.isValid}>{withdrawing ? "Đang gửi yêu cầu…" : "Rút tiền"}</button>

              </form>
            </>}
          </>}
          {activeTab === "history" && (loading.history ? <p className={s.loading} role="status">Đang tải lịch sử rút tiền…</p> : loadErrors.history ? null : history.length === 0 ? <div className={s.empty}>
            <span className={s.emptyIcon}><Receipt size={36} weight="light" /></span><h3>Chưa có giao dịch rút tiền</h3><button type="button" className={s.secondary} onClick={() => switchTab("orders")}>Xem đơn hoàn tiền <ArrowRight size={18} /></button>
          </div> : <div className={s.list}>{history.map(item => <article className={s.record} key={item.id}><div className={s.recordTop}><strong>{formatVnd(item.amount)}</strong><span className={s.status} data-status={item.status}>{item.status === "completed" ? "Đã chuyển" : item.status === "pending" ? "Chờ xử lý" : "Bị từ chối"}</span></div><div className={s.recordMeta}><span>{item.bank_name} · •••• {item.bank_account_no.slice(-4)}</span><time>{formatDate(item.created_at)}</time></div>{item.note && <p>{item.note}</p>}</article>)}</div>)}
        </div>
        <footer className={s.footer}><Link href="/#contact" onClick={onClose}><Question size={19} /> Cần hỗ trợ?</Link></footer>
      </div>
    </div>
  );
}
