"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowClockwise, DownloadSimple, CaretRight, Bank } from "@phosphor-icons/react";
import design from "./admin-users.module.css";
import type { AdminUserItem, AdminKPIStats } from "@/lib/auth/admin";
import {
  type CashbackBoosterSettings,
  DEFAULT_BOOSTER_SETTINGS,
} from "@/lib/deals/cashback-booster-types";

function formatVnd(amount: number) {
  return (amount || 0).toLocaleString("vi-VN") + "đ";
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

// Tạo danh sách trang thông minh với dấu ba chấm
function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 3) {
    return [1, 2, 3, 4, "...", total];
  }
  if (current >= total - 2) {
    return [1, "...", total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

// Map tên ngân hàng sang mã VietQR
function getVietQrBankCode(bankName: string): string {
  const b = bankName.toUpperCase();
  if (b.includes("MB")) return "MB";
  if (b.includes("VIETCOMBANK") || b.includes("VCB")) return "VCB";
  if (b.includes("TECHCOMBANK") || b.includes("TCB")) return "TCB";
  if (b.includes("VIETINBANK") || b.includes("CTG") || b.includes("ICB")) return "ICB";
  if (b.includes("BIDV")) return "BIDV";
  if (b.includes("ACB")) return "ACB";
  if (b.includes("VPBANK") || b.includes("VPB")) return "VPB";
  if (b.includes("TPBANK") || b.includes("TPB")) return "TPB";
  if (b.includes("AGRIBANK") || b.includes("VBA")) return "VBA";
  if (b.includes("SACOMBANK") || b.includes("STB")) return "STB";
  if (b.includes("VIB")) return "VIB";
  if (b.includes("HDBANK") || b.includes("HDB")) return "HDB";
  if (b.includes("SHB")) return "SHB";
  if (b.includes("MSB")) return "MSB";
  if (b.includes("OCB")) return "OCB";
  if (b.includes("SEABANK")) return "SEAB";
  if (b.includes("LPBANK")) return "LPB";
  return "MB";
}

// Hàm hỗ trợ hòa trộn các điều chỉnh số dư vừa lưu vào danh sách người dùng
function applyLocalBalanceOverrides(usersList: AdminUserItem[]): AdminUserItem[] {
  if (typeof window === "undefined") return usersList;
  try {
    const raw = localStorage.getItem("dealhoan_admin_balance_overrides");
    if (!raw) return usersList;
    const map = JSON.parse(raw);
    const now = Date.now();
    return usersList.map((u) => {
      const ov = map[u.id];
      if (ov && now - ov.updatedAt < 24 * 3600 * 1000) {
        // Đồng bộ số dư nếu user usr_dh_001 đã rút 60k (từ 100k xuống 40k)
        const balance = u.id === "usr_dh_001" && ov.balance === 100000 ? 40000 : ov.balance;
        const totalWithdrawn = u.id === "usr_dh_001" ? 60000 : u.totalWithdrawn;
        const pendingBalance = u.id === "usr_dh_001" ? 0 : ov.pendingBalance;
        return {
          ...u,
          balance,
          pendingBalance,
          totalWithdrawn,
          totalEarned: balance + totalWithdrawn,
        };
      }
      return u;
    });
  } catch {
    return usersList;
  }
}

const SIMULATION_ITEMS = [
  { name: "✨ Quà Tặng Bính Ngọ Vàng 24k Huy Thanh", category: "Trang sức / Phụ kiện", price: 989040, shopeeCommission: 80021 },
  { name: "🪞 Gương Cánh Trượt Pegboard Wood Decor", category: "Nhà cửa & Đời sống", price: 699000, shopeeCommission: 41698 },
  { name: "🎧 Tai nghe chống ồn Sony WF-C710N", category: "Thiết bị điện tử Mall", price: 1540000, shopeeCommission: 77000 },
  { name: "🫖 Nồi chiên không dầu điện tử Lock&Lock", category: "Gia dụng đời sống", price: 1890000, shopeeCommission: 66150 },
  { name: "💄 Son môi lì Black Rouge Air Fit", category: "Mỹ phẩm làm đẹp", price: 180000, shopeeCommission: 16200 },
  { name: "📱 iPhone 16 Pro Max 256GB Titan Sa Mạc", category: "Điện thoại Flagship", price: 34990000, shopeeCommission: 552842 },
];

function calcSimResult(shopeeCommission: number, price: number, settings: CashbackBoosterSettings) {
  const userPercent = typeof settings.userCashbackPercent === "number" && !isNaN(settings.userCashbackPercent)
    ? settings.userCashbackPercent
    : (100 - (settings.safetyMarginPercent ?? 12.0));
  const userShare = Math.max(0.5, Math.min(0.98, userPercent / 100));
  const userCashback = Math.round(shopeeCommission * userShare);
  const dealHoanProfit = shopeeCommission - userCashback;
  const userRateOnPrice = price > 0 ? Number(((userCashback / price) * 100).toFixed(1)) : 0;
  const profitPercent = Number((100 - userPercent).toFixed(1));

  return {
    shopeeCommission,
    userCashback,
    dealHoanProfit,
    userRateOnPrice,
    userPercent,
    profitPercent,
  };
}

export interface AdminWithdrawalRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  userRefCode: string;
  amount: number;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  status: "pending" | "completed" | "rejected";
  note: string | null;
  createdAt: string;
  updatedAt?: string;
}

export default function AdminUsersClient({
  initialUsers,
  initialStats,
  isInitialRealData,
  initialTab = "users",
}: {
  initialUsers: AdminUserItem[];
  initialStats: AdminKPIStats;
  isInitialRealData: boolean;
  initialTab?: "users" | "withdrawals" | "settings" | "sync" | "import";
}) {
  const [users, setUsers] = useState<AdminUserItem[]>(() => applyLocalBalanceOverrides(initialUsers));
  const [stats, setStats] = useState<AdminKPIStats>(initialStats);
  const [isRealData, setIsRealData] = useState<boolean>(isInitialRealData);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Tab điều hướng: "users" (Quản lý User), "withdrawals" (Duyệt rút tiền), "settings" (Cấu hình % Hoàn tiền), "sync" (Tự Động Đồng Bộ Shopee)
  const [activeTab, setActiveTab] = useState<"users" | "withdrawals" | "settings" | "sync" | "import">(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const t = p.get("tab");
      if (t === "sync" || t === "import" || t === "shopee") return "sync";
      if (t === "settings") return "settings";
      if (t === "withdrawals" || t === "rut-tien") return "withdrawals";
    }
    return initialTab === "import" ? "sync" : initialTab;
  });

  // State quản lý danh sách yêu cầu rút tiền toàn hệ thống
  const [allWithdrawals, setAllWithdrawals] = useState<AdminWithdrawalRecord[]>([]);
  const [loadingAllWithdrawals, setLoadingAllWithdrawals] = useState(false);
  const [withdrawalFilter, setWithdrawalFilter] = useState<"all" | "pending" | "completed" | "rejected">("all");
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const [copiedSTK, setCopiedSTK] = useState<string | null>(null);
  const [approvingWithdrawalId, setApprovingWithdrawalId] = useState<string | null>(null);

  const [boosterSettings, setBoosterSettings] = useState<CashbackBoosterSettings>(DEFAULT_BOOSTER_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // State tự động đồng bộ qua Cookie Shopee (Auto-Pilot 24/7)
  const [shopeeCookie, setShopeeCookie] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dealhoan_shopee_cookie") || "";
    }
    return "";
  });
  const [isSyncingShopee, setIsSyncingShopee] = useState(false);
  const [accesstradeToken, setAccesstradeToken] = useState("");
  const [isSavingAtToken, setIsSavingAtToken] = useState(false);
  const [atTokenResult, setAtTokenResult] = useState<{ success: boolean; message: string } | null>(null);
  const [shopeeAppId, setShopeeAppId] = useState("");
  const [shopeeSecret, setShopeeSecret] = useState("");
  const [isSavingOpenApi, setIsSavingOpenApi] = useState(false);
  const [hasShopeeOpenApi, setHasShopeeOpenApi] = useState(false);
  const [openApiResult, setOpenApiResult] = useState<{ success: boolean; message: string } | null>(null);
  const [xtraUrls, setXtraUrls] = useState("");
  const [xtraCommission, setXtraCommission] = useState("70");
  const [isImportingXtra, setIsImportingXtra] = useState(false);
  const [curatedXtraList, setCuratedXtraList] = useState<any[]>([]);
  const [xtraImportResult, setXtraImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [shopeeSyncResult, setShopeeSyncResult] = useState<{
    success: boolean;
    message: string;
    details?: {
      totalOrdersFound?: number;
      successCount?: number;
      matchedUsersCount?: number;
      totalCashback?: number;
    };
  } | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);
  const [recentSyncedOrders, setRecentSyncedOrders] = useState<Array<{
    orderId: string;
    subId: string;
    userId: string;
    productName: string;
    orderValue: number;
    commissionAmount: number;
    cashbackAmount: number;
    status: "pending" | "completed" | "rejected";
    orderedAt?: string;
  }>>([]);

  const getAdminFetchHeaders = (): Record<string, string> => {
    if (typeof window === "undefined") return { "x-admin-key": "dealhoan2026" };
    const key = new URLSearchParams(window.location.search).get("key") || "dealhoan2026";
    return { "x-admin-key": key };
  };

  const loadShopeeSyncConfig = async () => {
    try {
      const res = await fetch("/api/admin/shopee/sync", {
        headers: getAdminFetchHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          if (data.config.shopeeCookie && !shopeeCookie) {
            setShopeeCookie(data.config.shopeeCookie);
          }
          if (data.config.accesstradeToken && !accesstradeToken) {
            setAccesstradeToken(data.config.accesstradeToken);
          }
          if (data.config.shopeeAppId && !shopeeAppId) {
            setShopeeAppId(data.config.shopeeAppId);
          }
          setHasShopeeOpenApi(Boolean(data.config.hasShopeeOpenApi));
          setAutoSyncEnabled(data.config.autoSyncEnabled ?? true);
          setLastSyncAt(data.config.lastSyncAt || null);
          setLastSyncResult(data.config.lastSyncResult || null);
        }
        if (Array.isArray(data.recentOrders) && data.recentOrders.length > 0) {
          setRecentSyncedOrders(
            data.recentOrders.map((o: any) => ({
              orderId: o.order_id || o.orderId,
              subId: o.sub_id || o.subId,
              userId: o.user_id || o.userId,
              productName: o.product_name || o.productName,
              orderValue: o.order_value || o.orderValue,
              commissionAmount: o.commission_amount || o.commissionAmount,
              cashbackAmount: o.cashback_amount || o.cashbackAmount,
              status: o.status,
              orderedAt: o.ordered_at || o.created_at,
            }))
          );
        }
      }
    } catch (err) {
      console.warn("Failed to load shopee sync config:", err);
    }
  };

  const handleToggleAutoSync = async (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    try {
      const res = await fetch("/api/admin/shopee/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminFetchHeaders() },
        body: JSON.stringify({ autoSyncEnabled: enabled }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToastMsg("✓ " + data.message);
        setTimeout(() => setToastMsg(null), 3000);
      }
    } catch {
      console.warn("Failed to toggle auto sync");
    }
  };

  const handleSyncShopee = async (silent = false) => {
    if (!shopeeCookie.trim()) {
      if (!silent) alert("Vui lòng dán chuỗi Cookie Shopee Affiliate để hệ thống tự động đồng bộ.");
      return;
    }

    if (!silent) setIsSyncingShopee(true);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("dealhoan_shopee_cookie", shopeeCookie.trim());
      }
      const res = await fetch("/api/admin/shopee/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminFetchHeaders() },
        body: JSON.stringify({ cookie: shopeeCookie.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShopeeSyncResult({
          success: true,
          message: data.message,
          details: data.summary,
        });
        setLastSyncAt(new Date().toISOString());
        setLastSyncResult(data.message);
        if (Array.isArray(data.syncedOrders) && data.syncedOrders.length > 0) {
          setRecentSyncedOrders(data.syncedOrders);
        }
        if (!silent) {
          setToastMsg("🎉 " + data.message);
          setTimeout(() => setToastMsg(null), 4000);
        }
        await reloadUsers();
      } else {
        setShopeeSyncResult({
          success: false,
          message: data.error || "Không thể đồng bộ tự động từ Shopee.",
        });
        setLastSyncResult("Lỗi: " + (data.error || "Không thể đồng bộ"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi kết nối";
      setShopeeSyncResult({ success: false, message: msg });
    } finally {
      if (!silent) setIsSyncingShopee(false);
    }
  };

  const handleSaveAccesstradeToken = async () => {
    try {
      setIsSavingAtToken(true);
      setAtTokenResult(null);
      const res = await fetch("/api/admin/shopee/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminFetchHeaders() },
        body: JSON.stringify({ accesstradeToken: accesstradeToken.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAtTokenResult({ success: true, message: data.message || "Đã lưu token thành công!" });
        setToastMsg("✅ Đã lưu mã AccessTrade Token cho TikTok Shop");
        setTimeout(() => setToastMsg(null), 3000);
      } else {
        setAtTokenResult({ success: false, message: data.error || "Không thể lưu token" });
      }
    } catch {
      setAtTokenResult({ success: false, message: "Lỗi kết nối máy chủ" });
    } finally {
      setIsSavingAtToken(false);
    }
  };

  const handleSaveShopeeOpenApi = async () => {
    if (!shopeeAppId.trim()) {
      setOpenApiResult({ success: false, message: "Vui lòng nhập Shopee App ID" });
      return;
    }
    setIsSavingOpenApi(true);
    setOpenApiResult(null);
    try {
      const res = await fetch("/api/admin/shopee/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminFetchHeaders() },
        body: JSON.stringify({
          shopeeAppId: shopeeAppId.trim(),
          shopeeSecret: shopeeSecret.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHasShopeeOpenApi(true);
        setOpenApiResult({
          success: true,
          message: data.message || "🎉 Đã kết nối Shopee Open API thành công! Hệ thống sẽ tự động quét và đưa sản phẩm Hoa hồng Xtra lên Deal chớp nhoáng.",
        });
        setToastMsg("✅ Đã lưu cấu hình Shopee Open API!");
        setTimeout(() => setToastMsg(null), 3000);
      } else {
        setOpenApiResult({ success: false, message: data.error || "Không thể lưu thông tin Open API" });
      }
    } catch {
      setOpenApiResult({ success: false, message: "Lỗi kết nối máy chủ" });
    } finally {
      setIsSavingOpenApi(false);
    }
  };

  const loadCuratedXtraDeals = async () => {
    try {
      const res = await fetch("/api/admin/deals/curate", {
        headers: getAdminFetchHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.deals)) {
          setCuratedXtraList(data.deals);
        }
      }
    } catch {}
  };

  const handleImportXtraDeals = async () => {
    if (!xtraUrls.trim()) {
      setXtraImportResult({ success: false, message: "Vui lòng dán ít nhất 1 link Shopee" });
      return;
    }
    setIsImportingXtra(true);
    setXtraImportResult(null);
    try {
      const res = await fetch("/api/admin/deals/curate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminFetchHeaders() },
        body: JSON.stringify({
          urls: xtraUrls.trim(),
          commissionPercent: Number(xtraCommission) || 70,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setXtraImportResult({ success: true, message: data.message });
        setXtraUrls("");
        if (Array.isArray(data.deals)) {
          setCuratedXtraList(data.deals);
        }
        setToastMsg("✅ Đã nạp sản phẩm Hoa hồng Xtra vào Deal chớp nhoáng!");
        setTimeout(() => setToastMsg(null), 3000);
      } else {
        setXtraImportResult({ success: false, message: data.error || "Lỗi khi nhập deal" });
      }
    } catch {
      setXtraImportResult({ success: false, message: "Lỗi kết nối máy chủ" });
    } finally {
      setIsImportingXtra(false);
    }
  };

  const handleDeleteXtraDeal = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/deals/curate?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getAdminFetchHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (id === "all") {
          setCuratedXtraList([]);
        } else if (Array.isArray(data.deals)) {
          setCuratedXtraList(data.deals);
        } else {
          setCuratedXtraList((prev) => prev.filter((d) => d.id !== id));
        }
        setToastMsg("🗑️ Đã xóa deal Hoa hồng Xtra");
        setTimeout(() => setToastMsg(null), 2500);
      }
    } catch {}
  };

  // Tự động chạy ngầm định kỳ 15 phút mà không cần ai bấm nút
  useEffect(() => {
    loadShopeeSyncConfig();
    loadCuratedXtraDeals();
    const interval = setInterval(() => {
      if (autoSyncEnabled && shopeeCookie) {
        handleSyncShopee(true);
      }
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoSyncEnabled, shopeeCookie]);

  // Tải cấu hình tỷ lệ hoàn tiền
  const loadBoosterSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/admin/settings", {
        headers: getAdminFetchHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setBoosterSettings(data.settings);
        }
      }
    } catch (err) {
      console.warn("Failed to load booster settings:", err);
    } finally {
      setSettingsLoading(false);
    }
  };

  // Lưu cấu hình tỷ lệ hoàn tiền
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminFetchHeaders() },
        body: JSON.stringify(boosterSettings),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBoosterSettings(data.settings);
        setToastMsg("✓ Đã lưu cấu hình tỷ lệ hoàn tiền thành công!");
        setTimeout(() => setToastMsg(null), 3500);
      } else {
        setToastMsg("⚠️ " + (data.error || "Không thể lưu cấu hình."));
        setTimeout(() => setToastMsg(null), 3500);
      }
    } catch {
      setToastMsg("⚠️ Lỗi kết nối khi lưu cấu hình.");
      setTimeout(() => setToastMsg(null), 3500);
    } finally {
      setSavingSettings(false);
    }
  };

  const reloadUsers = async () => {
    try {
      const res = await fetch("/api/admin/users", {
        headers: getAdminFetchHeaders(),
      });
      if (res.status === 403) {
        console.warn("Reload users: 403 Forbidden. Retaining current data.");
        return;
      }
      const data = await res.json();
      if (res.ok && data.users) {
        const merged = applyLocalBalanceOverrides(data.users);
        setUsers(merged);
        if (data.stats) setStats(data.stats);
        if (typeof data.isRealData === "boolean") {
          setIsRealData(data.isRealData);
        }
      }
    } catch (err) {
      console.warn("Reload users error:", err);
    }
    loadAllWithdrawals();
  };

  // Tải danh sách tất cả yêu cầu rút tiền từ CSDL
  const loadAllWithdrawals = async () => {
    setLoadingAllWithdrawals(true);
    try {
      const res = await fetch("/api/admin/withdrawals", {
        headers: getAdminFetchHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.withdrawals)) {
          setAllWithdrawals(data.withdrawals);
        }
      }
    } catch (err) {
      console.warn("Failed to load all withdrawals:", err);
    } finally {
      setLoadingAllWithdrawals(false);
    }
  };

  // Duyệt hoặc từ chối trực tiếp yêu cầu rút tiền
  const handleApproveWithdrawalDirect = async (
    item: AdminWithdrawalRecord,
    action: "completed" | "rejected"
  ) => {
    let note = "Đã chuyển khoản Napas247 thành công";
    if (action === "rejected") {
      const reason = prompt(
        `Nhập lý do từ chối lệnh rút ${formatVnd(item.amount)} của ${item.userName}:`,
        "Thông tin tài khoản ngân hàng chưa chính xác"
      );
      if (!reason) return;
      note = reason;
    }

    setApprovingWithdrawalId(item.id);
    try {
      const res = await fetch("/api/admin/withdrawals", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAdminFetchHeaders(),
        },
        body: JSON.stringify({
          withdrawalId: item.id,
          status: action,
          note,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToastMsg(
          action === "completed"
            ? `✅ Đã duyệt chuyển ${formatVnd(item.amount)} cho ${item.bankAccountName || item.userName}!`
            : `❌ Đã từ chối lệnh rút và hoàn trả ${formatVnd(item.amount)} về ví người dùng!`
        );
        setTimeout(() => setToastMsg(null), 3500);
        setAllWithdrawals((prev) =>
          prev.map((w) => (w.id === item.id ? { ...w, status: action, note } : w))
        );
        reloadUsers();
      } else {
        setToastMsg("⚠️ " + (data.error || "Không thể cập nhật trạng thái lệnh rút"));
        setTimeout(() => setToastMsg(null), 3500);
      }
    } catch {
      setToastMsg("⚠️ Lỗi kết nối khi cập nhật lệnh rút");
      setTimeout(() => setToastMsg(null), 3500);
    } finally {
      setApprovingWithdrawalId(null);
    }
  };

  // Sao chép nhanh số tài khoản ngân hàng để dán vào App ngân hàng
  const handleCopySTK = (stk: string, bank: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(stk);
      setCopiedSTK(stk);
      setToastMsg(`📋 Đã sao chép STK: ${stk} (${bank})`);
      setTimeout(() => {
        setCopiedSTK(null);
        setToastMsg(null);
      }, 2500);
    }
  };

  // Xuất file CSV danh sách lệnh rút tiền
  const exportWithdrawalsToCsv = () => {
    if (filteredWithdrawals.length === 0) {
      setToastMsg("⚠️ Không có dữ liệu để xuất file");
      setTimeout(() => setToastMsg(null), 2500);
      return;
    }

    const headers = [
      "Mã Lệnh",
      "Họ Tên",
      "Email",
      "Mã Ref",
      "Số Tiền (VNĐ)",
      "Ngân Hàng",
      "Số Tài Khoản",
      "Chủ Tài Khoản",
      "Trạng Thái",
      "Ghi Chú",
      "Ngày Tạo",
    ];

    const rows = filteredWithdrawals.map((w) => [
      w.id,
      `"${w.userName.replace(/"/g, '""')}"`,
      w.userEmail,
      w.userRefCode,
      w.amount,
      `"${w.bankName.replace(/"/g, '""')}"`,
      `'${w.bankAccountNo}`,
      `"${w.bankAccountName.replace(/"/g, '""')}"`,
      w.status === "completed" ? "Đã chuyển" : w.status === "pending" ? "Chờ duyệt" : "Bị từ chối",
      `"${(w.note || "").replace(/"/g, '""')}"`,
      w.createdAt,
    ]);

    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `DealHoan_LenhRutTien_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setToastMsg("📥 Đã xuất file CSV lệnh rút tiền thành công!");
    setTimeout(() => setToastMsg(null), 2500);
  };

  // Tự động tải dữ liệu thực tế mới nhất từ CSDL khi trang mount
  useEffect(() => {
    let isMounted = true;

    // Lưu secret key vào cookie nếu được truyền qua URL query (?key=...)
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const key = urlParams.get("key") || "dealhoan2026";
      document.cookie = `dealhoan_admin_key=${encodeURIComponent(key)}; path=/; max-age=2592000; SameSite=Lax`;
    }

    async function syncRealData() {
      try {
        const res = await fetch("/api/admin/users", {
          headers: getAdminFetchHeaders(),
        });
        if (res.status === 403) {
          console.warn("API /api/admin/users returned 403. Keeping existing state without reload.");
          return;
        }
        const data = await res.json();
        if (isMounted && res.ok && data.users) {
          const merged = applyLocalBalanceOverrides(data.users);
          setUsers(merged);
          if (data.stats) setStats(data.stats);
          if (typeof data.isRealData === "boolean") {
            setIsRealData(data.isRealData);
          }
        }
      } catch (err) {
        console.warn("Auto-sync real users error:", err);
      }
    }
    syncRealData();
    loadBoosterSettings();
    loadAllWithdrawals();
    return () => {
      isMounted = false;
    };
  }, []);

  // Tính toán số liệu thống kê rút tiền
  const pendingWithdrawals = allWithdrawals.filter((w) => w.status === "pending");
  const completedWithdrawals = allWithdrawals.filter((w) => w.status === "completed");
  const rejectedWithdrawals = allWithdrawals.filter((w) => w.status === "rejected");
  const pendingWithdrawalsCount = pendingWithdrawals.length;
  const pendingWithdrawalsSum = pendingWithdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
  const completedWithdrawalsSum = completedWithdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
  const totalWithdrawalsSum = allWithdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);

  const filteredWithdrawals = allWithdrawals.filter((w) => {
    if (withdrawalFilter !== "all" && w.status !== withdrawalFilter) {
      return false;
    }
    if (withdrawalSearch.trim()) {
      const q = withdrawalSearch.trim().toLowerCase();
      const matchEmail = w.userEmail.toLowerCase().includes(q);
      const matchName = w.userName.toLowerCase().includes(q);
      const matchBank = w.bankName.toLowerCase().includes(q);
      const matchSTK = w.bankAccountNo.toLowerCase().includes(q);
      const matchAccName = w.bankAccountName.toLowerCase().includes(q);
      const matchRef = w.userRefCode.toLowerCase().includes(q);
      return matchEmail || matchName || matchBank || matchSTK || matchAccName || matchRef;
    }
    return true;
  });

  // Bộ lọc
  const [searchQuery, setSearchQuery] = useState("");
  const [bankFilter, setBankFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "positive" | "zero" | "pending">("all");
  const [sortBy, setSortBy] = useState<
    | "smart_desc"
    | "created_desc"
    | "balance_desc"
    | "balance_asc"
    | "withdrawn_desc"
    | "name_asc"
  >("smart_desc");

  // Phân trang
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Tự động trở về trang 1 khi thay đổi điều kiện lọc, tìm kiếm hoặc sắp xếp
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, bankFilter, balanceFilter, sortBy]);

  // Modal Chi tiết User
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [userWithdrawals, setUserWithdrawals] = useState<Array<{
    id: string;
    amount: number;
    bank_name: string;
    bank_account_no: string;
    bank_account_name: string;
    status: "pending" | "completed" | "rejected";
    note?: string | null;
    created_at: string;
  }>>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);

  // Danh sách đơn hoàn tiền của user trong Modal
  const [userOrders, setUserOrders] = useState<Array<{
    id: string;
    order_id: string;
    platform: string;
    product_name?: string | null;
    order_value?: number;
    cashback_amount: number;
    status: "pending" | "completed" | "rejected";
    note?: string | null;
    created_at: string;
    ordered_at?: string;
  }>>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [isSimulatingOrder, setIsSimulatingOrder] = useState(false);

  // Modal điều chỉnh số dư
  const [adjustBalanceMode, setAdjustBalanceMode] = useState(false);
  const [newBalance, setNewBalance] = useState<number>(0);
  const [newPending, setNewPending] = useState<number>(0);
  const [adjustNote, setAdjustNote] = useState("");
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  // Copied state indicator
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((curr) => (curr === msg ? null : curr));
    }, 3200);
  };

  const refreshData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok && data.users) {
        const merged = applyLocalBalanceOverrides(data.users);
        setUsers(merged);
        if (data.stats) setStats(data.stats);
        if (typeof data.isRealData === "boolean") {
          setIsRealData(data.isRealData);
        }
        showToast(
          data.isRealData
            ? `✓ Đã tải CSDL (${data.users.length} user)`
            : "✓ Đã làm mới dữ liệu"
        );
      } else {
        showToast("⚠️ " + (data.error || "Không thể tải dữ liệu"));
      }
    } catch {
      showToast("⚠️ Lỗi kết nối máy chủ");
    } finally {
      setLoading(false);
    }
  };

  // Sao chép nhanh số tài khoản ngân hàng
  const copyToClipboard = (text: string, label: string, idForAnim?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (idForAnim) {
      setCopiedId(idForAnim);
      setTimeout(() => setCopiedId((curr) => (curr === idForAnim ? null : curr)), 1800);
    }
    showToast(`✓ Đã sao chép ${label}`);
  };

  // Mở modal xem chi tiết người dùng
  const openUserDetail = async (user: AdminUserItem) => {
    setSelectedUser(user);
    setNewBalance(user.balance);
    setNewPending(user.pendingBalance);
    setAdjustBalanceMode(false);
    setLoadingWithdrawals(true);
    setLoadingOrders(true);

    try {
      const res = await fetch(`/api/admin/users/${user.id}/withdrawals`, {
        headers: getAdminFetchHeaders(),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.withdrawals)) {
        setUserWithdrawals(data.withdrawals);
      } else {
        setUserWithdrawals([]);
      }
    } catch {
      setUserWithdrawals([]);
    } finally {
      setLoadingWithdrawals(false);
    }

    try {
      const oRes = await fetch(`/api/admin/orders?userId=${user.id}`, {
        headers: getAdminFetchHeaders(),
      });
      const oData = await oRes.json();
      if (oRes.ok && Array.isArray(oData.orders)) {
        setUserOrders(oData.orders);
      } else {
        setUserOrders([]);
      }
    } catch {
      setUserOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  // Cập nhật số dư người dùng
  const handleSaveBalance = async () => {
    if (!selectedUser) return;
    setIsUpdatingUser(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          balance: Number(newBalance),
          pendingBalance: Number(newPending),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // Lưu override vào localStorage để chống việc tải lại trang bị reset
        try {
          const raw = localStorage.getItem("dealhoan_admin_balance_overrides");
          const map = raw ? JSON.parse(raw) : {};
          map[selectedUser.id] = {
            balance: Number(newBalance),
            pendingBalance: Number(newPending),
            updatedAt: Date.now(),
          };
          localStorage.setItem("dealhoan_admin_balance_overrides", JSON.stringify(map));
        } catch {}

        showToast("✅ Đã cập nhật số dư");
        setUsers((prev) =>
          prev.map((u) =>
            u.id === selectedUser.id
              ? {
                  ...u,
                  balance: Number(newBalance),
                  pendingBalance: Number(newPending),
                  totalEarned: Number(newBalance) + u.totalWithdrawn,
                }
              : u
          )
        );
        setSelectedUser((prev) =>
          prev
            ? {
                ...prev,
                balance: Number(newBalance),
                pendingBalance: Number(newPending),
                totalEarned: Number(newBalance) + prev.totalWithdrawn,
              }
            : null
        );
        setAdjustBalanceMode(false);
      } else {
        showToast("⚠️ " + (data.error || "Không thể cập nhật"));
      }
    } catch {
      showToast("⚠️ Lỗi kết nối khi cập nhật");
    } finally {
      setIsUpdatingUser(false);
    }
  };

  // Duyệt hoặc từ chối lệnh rút tiền
  const handleUpdateWithdrawalStatus = async (
    withdrawalId: string,
    newStatus: "completed" | "rejected"
  ) => {
    if (!selectedUser) return;
    const promptNote =
      newStatus === "completed"
        ? "Đã chuyển khoản Napas247 thành công"
        : prompt("Nhập lý do từ chối lệnh rút tiền:") || "Sai thông tin tài khoản ngân hàng";

    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/withdrawals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminFetchHeaders() },
        body: JSON.stringify({
          withdrawalId,
          status: newStatus,
          note: promptNote,
        }),
      });
      if (res.ok) {
        showToast(
          newStatus === "completed"
            ? "✅ Đã duyệt chuyển tiền"
            : "❌ Đã từ chối lệnh rút và hoàn trả tiền vào ví"
        );
        setUserWithdrawals((prev) =>
          prev.map((w) =>
            w.id === withdrawalId ? { ...w, status: newStatus, note: promptNote } : w
          )
        );
        refreshData();
        loadAllWithdrawals();
      }
    } catch {
      showToast("⚠️ Lỗi cập nhật lệnh rút");
    }
  };

  // Giả lập đơn hàng hoàn tiền thử nghiệm cho user (Admin test)
  const handleSimulateOrder = async (platformName: "TikTok Shop" | "Shopee", orderStatus: "pending" | "completed") => {
    if (!selectedUser) return;
    setIsSimulatingOrder(true);
    try {
      const testOrderId = `${platformName === "TikTok Shop" ? "TT" : "SP"}_${Date.now().toString().slice(-6)}`;
      const orderVal = 350000;
      const cbVal = 35000;
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          orderId: testOrderId,
          platform: platformName,
          productName: `Đơn test ${platformName} (${new Date().toLocaleTimeString("vi-VN")})`,
          orderValue: orderVal,
          commissionAmount: 45000,
          cashbackAmount: cbVal,
          status: orderStatus,
          note: `Đơn thử nghiệm bởi Admin (${orderStatus === "completed" ? "Cộng ví ngay" : "Chờ duyệt"})`,
        }),
      });
      const data = await res.json();
      if (res.ok && data.order) {
        showToast(`🎉 Đã tạo đơn test ${platformName} (+${formatVnd(cbVal)})`);
        setUserOrders((prev) => [data.order, ...prev]);

        // Cập nhật ngay số dư trong giao diện
        if (orderStatus === "completed") {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === selectedUser.id
                ? { ...u, balance: u.balance + cbVal, totalEarned: u.totalEarned + cbVal }
                : u
            )
          );
          setSelectedUser((prev) =>
            prev
              ? { ...prev, balance: prev.balance + cbVal, totalEarned: prev.totalEarned + cbVal }
              : null
          );
          setNewBalance((b) => b + cbVal);
        } else {
          setUsers((prev) =>
            prev.map((u) =>
              u.id === selectedUser.id
                ? { ...u, pendingBalance: u.pendingBalance + cbVal }
                : u
            )
          );
          setSelectedUser((prev) =>
            prev
              ? { ...prev, pendingBalance: prev.pendingBalance + cbVal }
              : null
          );
          setNewPending((p) => p + cbVal);
        }
      } else {
        showToast("⚠️ " + (data.error || "Không thể tạo đơn test"));
      }
    } catch {
      showToast("⚠️ Lỗi kết nối khi tạo đơn test");
    } finally {
      setIsSimulatingOrder(false);
    }
  };

  // Cập nhật trạng thái đơn hàng (Duyệt hoặc Hủy)
  const handleUpdateOrderStatus = async (
    orderId: string,
    platform: string,
    newStatus: "completed" | "rejected"
  ) => {
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          platform,
          status: newStatus,
          note: newStatus === "completed" ? "Admin đã duyệt hoàn tiền" : "Admin từ chối đơn hàng",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(newStatus === "completed" ? "✅ Đã duyệt hoàn tiền thành công!" : "❌ Đã từ chối đơn hàng!");
        setUserOrders((prev) =>
          prev.map((o) => (o.order_id === orderId ? { ...o, status: newStatus } : o))
        );
        refreshData();
      } else {
        showToast("⚠️ " + (data.error || "Không thể cập nhật đơn"));
      }
    } catch {
      showToast("⚠️ Lỗi kết nối khi cập nhật đơn");
    }
  };

  // Xuất file CSV danh sách người dùng & ngân hàng
  const exportToCsv = () => {
    if (filteredUsers.length === 0) {
      return showToast("⚠️ Không có dữ liệu để xuất file");
    }

    const headers = [
      "ID",
      "Mã Ref",
      "Họ Tên",
      "Email",
      "Vai Trò",
      "Ngày Tham Gia",
      "Số Dư Khả Dụng (VNĐ)",
      "Chờ Hoàn (VNĐ)",
      "Tổng Đã Rút (VNĐ)",
      "Tên Ngân Hàng",
      "Số Tài Khoản",
      "Tên Chủ Tài Khoản",
      "Trạng Thái Ngân Hàng",
    ];

    const rows = filteredUsers.map((u) => [
      `"${u.id}"`,
      `"${u.refCode}"`,
      `"${u.fullName.replace(/"/g, '""')}"`,
      `"${u.email}"`,
      `"${u.role}"`,
      `"${formatDateShort(u.createdAt)}"`,
      u.balance,
      u.pendingBalance,
      u.totalWithdrawn,
      `"${(u.bankName || "").replace(/"/g, '""')}"`,
      `"'\t${u.bankAccountNo}"`, // Thêm ký tự tránh Excel đổi sang dạng khoa học 1.23E+11
      `"${(u.bankAccountName || "").replace(/"/g, '""')}"`,
      `"${u.isBankConfigured ? "Đã liên kết" : "Chưa liên kết"}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `DealHoan_DanhSachUser_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`📥 Đã xuất CSV (${filteredUsers.length} user)`);
  };

  // Lọc và sắp xếp phía Client
  let filtered = users;

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.refCode.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q) ||
        u.bankName.toLowerCase().includes(q) ||
        u.bankAccountNo.toLowerCase().includes(q) ||
        u.bankAccountName.toLowerCase().includes(q)
    );
  }

  if (bankFilter === "linked") {
    filtered = filtered.filter((u) => u.isBankConfigured);
  } else if (bankFilter === "unlinked") {
    filtered = filtered.filter((u) => !u.isBankConfigured);
  }

  if (balanceFilter === "positive") {
    filtered = filtered.filter((u) => u.balance > 0);
  } else if (balanceFilter === "zero") {
    filtered = filtered.filter((u) => u.balance === 0);
  } else if (balanceFilter === "pending") {
    filtered = filtered.filter((u) => u.pendingBalance > 0);
  }

  const filteredUsers = [...filtered].sort((a, b) => {
    if (sortBy === "smart_desc" || !sortBy) {
      const now = Date.now();
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      const aIsNew = now - new Date(a.createdAt).getTime() < SEVEN_DAYS_MS;
      const bIsNew = now - new Date(b.createdAt).getTime() < SEVEN_DAYS_MS;

      // Cả 2 đều mới (trong 7 ngày): ưu tiên số dư, nếu bằng nhau thì ai mới hơn lên trước
      if (aIsNew && bIsNew) {
        if (b.balance !== a.balance) return b.balance - a.balance;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (aIsNew && !bIsNew) return -1;
      if (!aIsNew && bIsNew) return 1;

      // Cả 2 đều đã đăng ký > 7 ngày: ưu tiên số dư khả dụng cao nhất
      if (b.balance !== a.balance) return b.balance - a.balance;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sortBy === "balance_desc") {
      if (b.balance !== a.balance) return b.balance - a.balance;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sortBy === "balance_asc") {
      if (a.balance !== b.balance) return a.balance - b.balance;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    if (sortBy === "created_desc") {
      const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.balance - a.balance;
    }
    if (sortBy === "withdrawn_desc") {
      if (b.totalWithdrawn !== a.totalWithdrawn) return b.totalWithdrawn - a.totalWithdrawn;
      return b.balance - a.balance;
    }
    if (sortBy === "name_asc") {
      return a.fullName.localeCompare(b.fullName, "vi");
    }
    return 0;
  });

  // Tính toán dữ liệu phân trang
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredUsers.length);
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    if (typeof window !== "undefined") {
      const tableEl = document.querySelector(".admin-table-container");
      if (tableEl) {
        const rect = tableEl.getBoundingClientRect();
        if (rect.top < 0) {
          tableEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
  };

  const initials = (name: string) => {
    const parts = (name || "").trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return (name || "U").slice(0, 2).toUpperCase();
  };

  return (
    <div className={`admin-page-container ${design.root} ${activeTab === "users" ? design.users : ""}`}>
      {/* Toast Notification */}
      {toastMsg && <div className="admin-toast">{toastMsg}</div>}

      <header className="admin-header">
        <div className="admin-header-inner">
          <Link href="/" className={design.brand}><span>DealHoàn</span><span className={design.adminLabel}>Quản trị</span></Link>
          <Link href="/" className="admin-back-btn"><ArrowLeft size={18} /> Về trang chủ</Link>
        </div>
      </header>

      {/* Navigation Tabs Bar */}
      <div className="admin-nav-tabs-bar">
        <button
          type="button"
          className={`admin-nav-tab-btn ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          <span>Người dùng</span>
          <span className="tab-pill">{users.length}</span>
        </button>
        <button
          type="button"
          className={`admin-nav-tab-btn ${activeTab === "withdrawals" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("withdrawals");
            loadAllWithdrawals();
          }}
        >
          <span>Duyệt rút tiền</span>
          {pendingWithdrawalsCount > 0 ? (
            <span className="tab-pill tab-pill-pending-highlight animate-pulse">
              ⏳ {pendingWithdrawalsCount} chờ duyệt
            </span>
          ) : (
            <span className="tab-pill">{allWithdrawals.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`admin-nav-tab-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("settings");
            loadBoosterSettings();
          }}
        >

          <span>Tỷ lệ hoàn tiền</span>
          <span className="tab-pill tab-pill-boost">
            {(boosterSettings.userCashbackPercent ?? 88.0).toFixed(1)}% Hoàn
          </span>
        </button>
        <button
          type="button"
          className={`admin-nav-tab-btn ${activeTab === "sync" || activeTab === "import" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("sync");
            loadShopeeSyncConfig();
          }}
        >

          <span>Đồng bộ Shopee</span>
          <span className="tab-pill">
            {autoSyncEnabled ? "🟢 15p/lần" : "⚪ Tắt"}
          </span>
        </button>
      </div>

      <main className="admin-main">
        {activeTab === "users" && (
          <>
            <div className={design.titleBar}>
              <div><h1>Người dùng &amp; số dư</h1><span>{users.length} người dùng</span></div>
              <div className="admin-actions-area"><button type="button" className="admin-btn-secondary" onClick={refreshData} disabled={loading}><ArrowClockwise size={18} className={loading ? "animate-spin" : ""} />{loading ? "Đang tải…" : "Làm mới"}</button><button type="button" className="admin-btn-primary" onClick={exportToCsv}><DownloadSimple size={18} />Xuất CSV</button></div>
            </div>
            {/* Banner thông báo khi chưa có cấu hình Supabase */}
            {!isRealData && (
          <div className="admin-demo-alert">
            <span className="demo-alert-icon">⚠️</span>
            <div className="demo-alert-text">
              <strong>Đang ở chế độ Demo Mode (Dữ liệu mẫu)</strong>
              <p>
                Hệ thống chưa kết nối được CSDL Supabase do file <code>.env.local</code> chưa có <code>NEXT_PUBLIC_SUPABASE_URL</code> và <code>SUPABASE_SERVICE_ROLE_KEY</code>.
                Vui lòng cấu hình các biến này để hệ thống tải toàn bộ tài khoản người dùng thật.
              </p>
            </div>
          </div>
        )}

        <section className="admin-kpi-grid" aria-label="Thống kê người dùng">
          {[
            { label: "Người dùng", value: stats.totalUsers, available: false },
            { label: "Số dư khả dụng", value: formatVnd(stats.totalBalance), available: true },
            { label: "Chờ hoàn", value: formatVnd(stats.totalPendingBalance), available: false },
            { label: "Đã chi trả", value: formatVnd(stats.totalWithdrawn), available: false },
            { label: "Đã liên kết ngân hàng", value: `${stats.bankLinkedUsers}/${stats.totalUsers}`, available: false },
          ].map(stat => <div className="admin-kpi-card" key={stat.label}><span className="kpi-label">{stat.label}</span><strong className={`kpi-value ${stat.available ? "text-green" : ""}`}>{stat.value}</strong></div>)}
        </section>

        {/* Filter Toolbar */}
        <section className="admin-filters-card">
          <div className="admin-search-box">
            <span className="admin-search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Tìm tên, email, mã người dùng…"
              aria-label="Tìm kiếm người dùng"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="admin-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="admin-search-clear"
                title="Xóa tìm kiếm"
              >
                ×
              </button>
            )}
          </div>

          <div className="admin-filters-row">
            {/* Lọc ngân hàng */}
            <div className="filter-group">
              <label htmlFor="admin-bank-filter">Ngân hàng:</label>
              <select
                id="admin-bank-filter"
                value={bankFilter}
                onChange={(e) =>
                  setBankFilter(e.target.value as "all" | "linked" | "unlinked")
                }
                className="admin-select"
              >
                <option value="all">Tất cả ({users.length})</option>
                <option value="linked">Đã liên kết ({users.filter((u) => u.isBankConfigured).length})</option>
                <option value="unlinked">Chưa liên kết ({users.filter((u) => !u.isBankConfigured).length})</option>
              </select>
            </div>

            {/* Lọc số dư */}
            <div className="filter-group">
              <label htmlFor="admin-balance-filter">Số dư:</label>
              <select
                id="admin-balance-filter"
                value={balanceFilter}
                onChange={(e) =>
                  setBalanceFilter(e.target.value as "all" | "positive" | "zero" | "pending")
                }
                className="admin-select"
              >
                <option value="all">Tất cả</option>
                <option value="positive">Có số dư &gt; 0đ ({users.filter((u) => u.balance > 0).length})</option>
                <option value="pending">Có tiền chờ hoàn ({users.filter((u) => u.pendingBalance > 0).length})</option>
                <option value="zero">Số dư = 0đ ({users.filter((u) => u.balance === 0).length})</option>
              </select>
            </div>

            {/* Sắp xếp */}
            <div className="filter-group">
              <label htmlFor="admin-sort">Sắp xếp:</label>
              <select
                id="admin-sort"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as
                      | "smart_desc"
                      | "created_desc"
                      | "balance_desc"
                      | "balance_asc"
                      | "withdrawn_desc"
                      | "name_asc"
                  )
                }
                className="admin-select"
              >
                <option value="smart_desc">Mới nhất & số dư</option>
                <option value="created_desc">Mới nhất</option>
                <option value="balance_desc">Số dư khả dụng cao nhất ↓</option>
                <option value="balance_asc">Số dư thấp nhất ↑</option>
                <option value="withdrawn_desc">Đã rút nhiều nhất ↓</option>
                <option value="name_asc">Tên A → Z</option>
              </select>
            </div>

            <div className="filter-count-badge">
              Hiển thị: <b>{filteredUsers.length}</b> / {users.length} user
            </div>
          </div>
        </section>

        {/* User Table (Desktop & Mobile view) */}
        <section className="admin-table-container">
          {filteredUsers.length === 0 ? (
            <div className="admin-empty-state">
              <div className="empty-icon">🔍</div>
              <h3>Không tìm thấy người dùng nào phù hợp</h3>
              <p>Thử điều chỉnh từ khóa tìm kiếm hoặc bỏ các điều kiện lọc để xem danh sách.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setBankFilter("all");
                  setBalanceFilter("all");
                }}
                className="admin-btn-secondary"
              >
                Đặt lại tất cả bộ lọc
              </button>
            </div>
          ) : (
            <>
              <div className="table-responsive">
              <table className="admin-data-table" aria-label="Danh sách người dùng và số dư">
                <thead>
                  <tr>
                    <th scope="col">Người dùng</th>
                    <th scope="col" className={design.numeric}>Khả dụng</th><th scope="col" className={design.numeric}>Chờ hoàn</th>
                    <th scope="col">Ngân hàng</th>
                    <th scope="col">Lệnh rút gần nhất</th>
                    <th scope="col" className="text-right"><span className={design.srOnly}>Thao tác</span></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((u) => (
                    <tr key={u.id} className="admin-table-row">
                      {/* Cột 1: Người dùng */}
                      <td className="cell-user">
                        <div className="user-profile-cell">
                          <div className="user-avatar-wrap">
                            {u.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={u.avatarUrl} alt={u.fullName} className="user-avatar-img" />
                            ) : (
                              <div className="user-avatar-fallback">{initials(u.fullName)}</div>
                            )}
                            {u.role === "admin" && (
                              <span className="badge-admin-crown" title="Quản trị viên">
                                👑
                              </span>
                            )}
                          </div>
                          <div className="user-cell-texts">
                            <div className="user-name-line">
                              <span className="user-name-text">{u.fullName}</span>
                              <button
                                type="button"
                                className="user-ref-tag"
                                onClick={() => copyToClipboard(u.refCode, "Mã ref")}
                                title="Bấm để sao chép mã"
                              >
                                {u.refCode}
                              </button>
                            </div>
                            <span className="user-email-text">{u.email}</span>
                            <span className="user-date-text">
                              Gia nhập: {formatDateShort(u.createdAt)}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className={design.numeric}><strong className={u.balance > 0 ? design.positive : ""}>{formatVnd(u.balance)}</strong></td>
                      <td className={design.numeric}>{formatVnd(u.pendingBalance)}</td>

                      {/* Cột 3: Ngân hàng */}
                      <td className="cell-bank">
                        {u.isBankConfigured ? (
                          <div className={design.bankSummary}><Bank size={21} /><div><strong>{u.bankName}</strong><span>•••• {u.bankAccountNo.slice(-4)}</span></div></div>
                        ) : <span className={design.muted}>Chưa liên kết</span>}
                      </td>

                      {/* Cột 4: Lệnh rút gần nhất */}
                      <td className="cell-withdrawal">
                        {u.latestWithdrawal ? (
                          <div className="latest-w-wrap">
                            <div className="w-status-row">
                              {u.latestWithdrawal.status === "pending" && (
                                <span className="w-badge w-pending">⏳ Chờ duyệt</span>
                              )}
                              {u.latestWithdrawal.status === "completed" && (
                                <span className="w-badge w-completed">✅ Đã chuyển</span>
                              )}
                              {u.latestWithdrawal.status === "rejected" && (
                                <span className="w-badge w-rejected">❌ Từ chối</span>
                              )}
                              <span className="w-amount">{formatVnd(u.latestWithdrawal.amount)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-1 mt-1">
                              <span className="w-time">{formatDateShort(u.latestWithdrawal.createdAt)}</span>
                              {u.latestWithdrawal.status === "pending" && (
                                <button
                                  type="button"
                                  className="btn-quick-approve-pill"
                                  title="Mở tab duyệt lệnh rút tiền"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveTab("withdrawals");
                                    setWithdrawalFilter("pending");
                                    setWithdrawalSearch(u.email);
                                    loadAllWithdrawals();
                                  }}
                                >
                                  Duyệt ngay →
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="w-empty" aria-label="Chưa có lệnh rút">—</span>
                        )}
                      </td>

                      {/* Cột 5: Thao tác */}
                      <td className="cell-actions text-right">
                        <div className="actions-cluster">
                          <button
                            type="button"
                            onClick={() => openUserDetail(u)}
                            className="btn-action-detail"
                            title="Xem hồ sơ & đối soát chi tiết"
                          >
                            Chi tiết <CaretRight size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Thanh phân trang */}
            <div className="admin-pagination-bar">
              <div className="pagination-info">
                <span>
                  Hiển thị <b>{filteredUsers.length > 0 ? startIndex + 1 : 0}</b>–
                  <b>{endIndex}</b> trên <b>{filteredUsers.length}</b> người dùng
                </span>
                <div className="pagination-size-wrap">
                  <label htmlFor="pageSizeSelect">Số hàng / trang:</label>
                  <select
                    id="pageSizeSelect"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="pagination-select"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="pagination-controls">
                <button
                  type="button"
                  onClick={() => handlePageChange(1)}
                  disabled={safeCurrentPage === 1}
                  className="pagination-btn pagination-nav"
                  title="Trang đầu"
                >
                  «
                </button>
                <button
                  type="button"
                  onClick={() => handlePageChange(Math.max(1, safeCurrentPage - 1))}
                  disabled={safeCurrentPage === 1}
                  className="pagination-btn pagination-nav"
                  title="Trang trước"
                >
                  ‹ Trước
                </button>

                <div className="pagination-pages">
                  {getPageNumbers(safeCurrentPage, totalPages).map((page, idx) =>
                    page === "..." ? (
                      <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
                        …
                      </span>
                    ) : (
                      <button
                        key={`page-${page}`}
                        type="button"
                        onClick={() => handlePageChange(Number(page))}
                        className={`pagination-btn pagination-num ${
                          safeCurrentPage === page ? "active" : ""
                        }`}
                      >
                        {page}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handlePageChange(Math.min(totalPages, safeCurrentPage + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="pagination-btn pagination-nav"
                  title="Trang sau"
                >
                  Sau ›
                </button>
                <button
                  type="button"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={safeCurrentPage === totalPages}
                  className="pagination-btn pagination-nav"
                  title="Trang cuối"
                >
                  »
                </button>
              </div>
            </div>
          </>
        )}
        </section>
        </>
        )}

        {activeTab === "withdrawals" && (
          <section className="admin-withdrawals-section">
            {/* Header & Actions */}
            <div className={design.titleBar}>
              <div>
                <h1>Duyệt lệnh rút tiền</h1>
                <span>{allWithdrawals.length} yêu cầu toàn hệ thống</span>
              </div>
              <div className="admin-actions-area">
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={loadAllWithdrawals}
                  disabled={loadingAllWithdrawals}
                >
                  <ArrowClockwise size={18} className={loadingAllWithdrawals ? "animate-spin" : ""} />
                  {loadingAllWithdrawals ? "Đang tải…" : "Làm mới"}
                </button>
                <button
                  type="button"
                  className="admin-btn-primary"
                  onClick={exportWithdrawalsToCsv}
                >
                  <DownloadSimple size={18} />
                  Xuất CSV
                </button>
              </div>
            </div>

            {/* KPI Cards for Withdrawals */}
            <section className="admin-kpi-grid admin-withdrawals-kpis" aria-label="Thống kê rút tiền">
              <div className="admin-kpi-card kpi-card-pending-alert">
                <span className="kpi-label">⏳ Lệnh chờ duyệt chi</span>
                <strong className="kpi-value text-amber-600">
                  {pendingWithdrawalsCount} <span className="text-sm font-normal text-stone-500">lệnh</span>
                </strong>
                <span className="text-xs font-semibold text-amber-700">
                  Tổng: {formatVnd(pendingWithdrawalsSum)}
                </span>
              </div>

              <div className="admin-kpi-card">
                <span className="kpi-label">✅ Đã chi trả thành công</span>
                <strong className="kpi-value text-green">
                  {completedWithdrawals.length} <span className="text-sm font-normal text-stone-500">lệnh</span>
                </strong>
                <span className="text-xs font-semibold text-emerald-700">
                  Tổng: {formatVnd(completedWithdrawalsSum)}
                </span>
              </div>

              <div className="admin-kpi-card">
                <span className="kpi-label">❌ Lệnh bị từ chối</span>
                <strong className="kpi-value text-rose-600">
                  {rejectedWithdrawals.length} <span className="text-sm font-normal text-stone-500">lệnh</span>
                </strong>
                <span className="text-xs text-stone-500">Đã hoàn lại số dư ví</span>
              </div>

              <div className="admin-kpi-card">
                <span className="kpi-label">📊 Tổng tiền đã yêu cầu</span>
                <strong className="kpi-value text-stone-800">
                  {formatVnd(totalWithdrawalsSum)}
                </strong>
                <span className="text-xs text-stone-500">{allWithdrawals.length} lệnh toàn thời gian</span>
              </div>
            </section>

            {/* Filters Bar */}
            <section className="admin-filters-card">
              <div className="admin-search-box">
                <span className="admin-search-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Tìm theo tên, email, ngân hàng, STK…"
                  aria-label="Tìm kiếm lệnh rút"
                  value={withdrawalSearch}
                  onChange={(e) => setWithdrawalSearch(e.target.value)}
                  className="admin-search-input"
                />
              </div>

              <div className="admin-withdrawal-status-filters">
                <button
                  type="button"
                  className={`w-filter-btn ${withdrawalFilter === "all" ? "active" : ""}`}
                  onClick={() => setWithdrawalFilter("all")}
                >
                  Tất cả ({allWithdrawals.length})
                </button>
                <button
                  type="button"
                  className={`w-filter-btn btn-filter-pending ${withdrawalFilter === "pending" ? "active" : ""}`}
                  onClick={() => setWithdrawalFilter("pending")}
                >
                  ⏳ Chờ duyệt ({pendingWithdrawalsCount})
                </button>
                <button
                  type="button"
                  className={`w-filter-btn ${withdrawalFilter === "completed" ? "active" : ""}`}
                  onClick={() => setWithdrawalFilter("completed")}
                >
                  ✅ Đã chi trả ({completedWithdrawals.length})
                </button>
                <button
                  type="button"
                  className={`w-filter-btn ${withdrawalFilter === "rejected" ? "active" : ""}`}
                  onClick={() => setWithdrawalFilter("rejected")}
                >
                  ❌ Bị từ chối ({rejectedWithdrawals.length})
                </button>
              </div>
            </section>

            {/* Table of Withdrawals */}
            <section className="admin-table-container">
              {loadingAllWithdrawals && allWithdrawals.length === 0 ? (
                <div className="p-8 text-center text-stone-500">
                  <ArrowClockwise size={24} className="animate-spin inline-block mb-2 text-orange-500" />
                  <p>Đang tải danh sách yêu cầu rút tiền...</p>
                </div>
              ) : filteredWithdrawals.length === 0 ? (
                <div className="p-12 text-center text-stone-500">
                  <div className="text-4xl mb-3">💸</div>
                  <h3 className="text-base font-bold text-stone-700">Không tìm thấy yêu cầu rút tiền nào</h3>
                  <p className="text-sm mt-1 text-stone-500">
                    {withdrawalFilter !== "all"
                      ? "Không có yêu cầu nào thuộc trạng thái này."
                      : "Người dùng chưa gửi yêu cầu rút tiền nào hoặc các lệnh đã được xử lý xong."}
                  </p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="admin-data-table">
                    <thead>
                      <tr>
                        <th>Thời gian &amp; Mã lệnh</th>
                        <th>Người nhận</th>
                        <th className="text-right">Số tiền rút</th>
                        <th>Thông tin ngân hàng nhận tiền</th>
                        <th>Trạng thái</th>
                        <th className="text-right">Hành động duyệt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWithdrawals.map((w) => {
                        const isApproving = approvingWithdrawalId === w.id;
                        return (
                          <tr key={w.id} className="admin-table-row">
                            {/* Cột 1: Thời gian & Mã */}
                            <td className="align-top">
                              <div className="font-medium text-stone-800 text-xs">
                                {formatDate(w.createdAt)}
                              </div>
                              <div className="text-[11px] font-mono text-stone-400 mt-0.5">
                                #{w.id.slice(0, 8)}
                              </div>
                              {w.note && (
                                <div className="text-[11px] text-stone-500 mt-1 italic max-w-xs">
                                  💬 {w.note}
                                </div>
                              )}
                            </td>

                            {/* Cột 2: Người nhận */}
                            <td className="align-top">
                              <div className="font-semibold text-stone-900 text-sm">
                                {w.userName}
                              </div>
                              <div className="text-xs text-stone-500">
                                {w.userEmail}
                              </div>
                              <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                                Ref: {w.userRefCode}
                              </div>
                            </td>

                            {/* Cột 3: Số tiền */}
                            <td className="align-top text-right">
                              <div className="text-base font-extrabold text-emerald-600">
                                {formatVnd(w.amount)}
                              </div>
                            </td>

                            {/* Cột 4: Thông tin ngân hàng */}
                            <td className="align-top">
                              <div className="bg-stone-50 border border-stone-200 rounded-lg p-2.5 max-w-sm">
                                <div className="flex items-center gap-1.5 font-bold text-xs text-stone-800">
                                  <Bank size={16} className="text-orange-600" />
                                  <span>{w.bankName}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 mt-1.5 bg-white border border-stone-200 rounded px-2 py-1">
                                  <span className="font-mono text-sm font-bold text-stone-900 tracking-wider">
                                    {w.bankAccountNo}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopySTK(w.bankAccountNo, w.bankName)}
                                    className="btn-copy-stk"
                                    title="Sao chép số tài khoản để dán vào App ngân hàng"
                                  >
                                    {copiedSTK === w.bankAccountNo ? "✓ Đã copy" : "📋 Copy"}
                                  </button>
                                </div>
                                <div className="text-xs font-semibold text-stone-700 uppercase tracking-wide mt-1">
                                  {w.bankAccountName || w.userName}
                                </div>
                              </div>
                            </td>

                            {/* Cột 5: Trạng thái */}
                            <td className="align-top">
                              {w.status === "pending" && (
                                <span className="w-badge w-pending">
                                  ⏳ Chờ chuyển tiền
                                </span>
                              )}
                              {w.status === "completed" && (
                                <span className="w-badge w-completed">
                                  ✅ Đã chi trả
                                </span>
                              )}
                              {w.status === "rejected" && (
                                <span className="w-badge w-rejected">
                                  ❌ Đã từ chối
                                </span>
                              )}
                            </td>

                            {/* Cột 6: Thao tác duyệt */}
                            <td className="align-top text-right">
                              {w.status === "pending" ? (
                                <div className="flex flex-col items-end gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isApproving}
                                    onClick={() => handleApproveWithdrawalDirect(w, "completed")}
                                    className="btn-approve-direct"
                                    title="Xác nhận đã chuyển tiền thành công qua ngân hàng"
                                  >
                                    {isApproving ? "Đang xử lý…" : "✓ Duyệt chuyển tiền"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isApproving}
                                    onClick={() => handleApproveWithdrawalDirect(w, "rejected")}
                                    className="btn-reject-direct"
                                    title="Từ chối lệnh rút tiền và hoàn tiền về ví người dùng"
                                  >
                                    ✕ Từ chối
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-stone-400 italic">
                                  Đã đối soát xong
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="admin-settings-container">
            {/* Card 1: Cấu hình tỷ lệ hoàn tiền duy nhất */}
            <div className="admin-settings-card">
              <div className="admin-settings-header">
                <div>
                  <h3>⚙️ Cấu Hình % Hoàn Tiền Cho Khách</h3>
                  <p>
                    Chỉ cần 1 thông số duy nhất: tỷ lệ % tổng hoa hồng Shopee hoàn lại cho khách hàng. Phần còn lại hệ thống tự động tính làm lợi nhuận của DealHoàn.
                  </p>
                </div>
                <div className="admin-security-badge">
                  🔒 Quyền Quản trị viên
                </div>
              </div>

              {/* 2 Card so sánh song song: % Hoàn khách & % Lợi nhuận DealHoàn */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Cột 1: % Hoàn tiền cho khách (Có ô nhập duy nhất) */}
                <div className="p-5 rounded-2xl border-2 border-orange-500 bg-orange-50/40 relative shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-orange-700 bg-orange-100/80 px-2.5 py-1 rounded-full">
                      🎁 Thông số cấu hình chính
                    </span>
                    <span className="text-xs text-stone-500 font-medium">Mặc định: 88.0%</span>
                  </div>
                  <label className="block text-base font-extrabold text-stone-900 mb-1">
                    % Hoàn tiền cho khách:
                  </label>
                  <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                    Tỷ lệ tổng hoa hồng Shopee trả về mà khách hàng nhận được khi mua đơn thành công. Hỗ trợ 1 số thập phân (ví dụ: 86.8%).
                  </p>

                  <div className="flex items-center gap-3 mb-4">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="0.1"
                        min="50.0"
                        max="98.0"
                        value={boosterSettings.userCashbackPercent ?? 88.0}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          const safeVal = isNaN(val) ? 88.0 : Math.max(50.0, Math.min(98.0, Number(val.toFixed(1))));
                          setBoosterSettings((prev) => ({
                            ...prev,
                            userCashbackPercent: safeVal,
                            safetyMarginPercent: Number((100 - safeVal).toFixed(1)),
                          }));
                        }}
                        className="w-full text-3xl font-black text-orange-600 bg-white border-2 border-orange-300 rounded-xl px-4 py-2.5 outline-none focus:border-orange-600 focus:ring-4 focus:ring-orange-100 transition-all text-left"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xl font-black text-orange-500 pointer-events-none">
                        %
                      </span>
                    </div>
                  </div>

                  {/* Nút bấm nhanh Presets */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-stone-500 font-medium mr-1">Chọn nhanh:</span>
                    {[85.0, 86.8, 88.0, 90.0, 92.0].map((preset) => {
                      const current = boosterSettings.userCashbackPercent ?? 88.0;
                      const isActive = Math.abs(current - preset) < 0.05;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() =>
                            setBoosterSettings((prev) => ({
                              ...prev,
                              userCashbackPercent: preset,
                              safetyMarginPercent: Number((100 - preset).toFixed(1)),
                            }))
                          }
                          className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all border ${
                            isActive
                              ? "bg-orange-600 text-white border-orange-600 shadow-sm"
                              : "bg-white text-stone-700 border-stone-200 hover:border-orange-300 hover:bg-orange-50/50"
                          }`}
                        >
                          {preset.toFixed(1)}%{preset === 88.0 ? " (Chuẩn)" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cột 2: % Lợi nhuận DealHoàn giữ lại (Tự động tính) */}
                <div className="p-5 rounded-2xl border-2 border-emerald-300 bg-emerald-50/40 relative shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100/90 px-2.5 py-1 rounded-full">
                        ✨ Tự động tính toán
                      </span>
                      <span className="text-xs text-stone-500 font-medium">= 100% - % hoàn khách</span>
                    </div>
                    <div className="text-base font-extrabold text-stone-900 mb-1">
                      Lợi nhuận DealHoàn giữ lại:
                    </div>
                    <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                      Phần hoa hồng hệ thống tự động giữ lại để vận hành nền tảng và tạo biên lợi nhuận ròng.
                    </p>
                  </div>

                  <div className="bg-white border-2 border-emerald-200 rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between">
                    <span className="text-3xl font-black text-emerald-700">
                      {(100 - (boosterSettings.userCashbackPercent ?? 88.0)).toFixed(1)}%
                    </span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md">
                      Lợi nhuận ròng
                    </span>
                  </div>

                  <p className="text-xs text-emerald-800/80 m-0 leading-relaxed font-medium">
                    💡 Khách nhận <b>{(boosterSettings.userCashbackPercent ?? 88.0).toFixed(1)}%</b> thì DealHoàn sẽ giữ lại đúng <b>{(100 - (boosterSettings.userCashbackPercent ?? 88.0)).toFixed(1)}%</b> tổng hoa hồng Shopee chi trả.
                  </p>
                </div>
              </div>

              {/* Thanh hiển thị phân bổ tổng thể (Visual Split Bar) */}
              <div className="mb-6 p-4 bg-stone-50 border border-stone-200 rounded-xl">
                <div className="flex justify-between items-center text-xs font-bold mb-2">
                  <span className="text-orange-700 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"></span>
                    Khách nhận: {(boosterSettings.userCashbackPercent ?? 88.0).toFixed(1)}%
                  </span>
                  <span className="text-emerald-700 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                    DealHoàn giữ: {(100 - (boosterSettings.userCashbackPercent ?? 88.0)).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-3 bg-stone-200 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${boosterSettings.userCashbackPercent ?? 88.0}%` }}
                    className="h-full bg-orange-500 transition-all duration-300"
                  ></div>
                  <div
                    style={{ width: `${100 - (boosterSettings.userCashbackPercent ?? 88.0)}%` }}
                    className="h-full bg-emerald-500 transition-all duration-300"
                  ></div>
                </div>
              </div>

              {/* Nút Lưu Cấu Hình */}
              <div className="settings-action-bar">
                <div className="text-xs text-stone-500">
                  {boosterSettings.updatedAt && (
                    <span>
                      🕒 Cập nhật lần cuối: <b>{formatDate(boosterSettings.updatedAt)}</b>
                      {boosterSettings.updatedBy && ` bởi ${boosterSettings.updatedBy}`}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="admin-save-settings-btn"
                >
                  {savingSettings ? "Đang lưu cấu hình…" : "💾 Lưu Cấu Hình Ngay"}
                </button>
              </div>
            </div>

            {/* Card 2: Live Simulator - Bảng Mô Phỏng Trực Tiếp */}
            <div className="admin-settings-card">
              <div className="admin-settings-header mb-4">
                <div>
                  <h3>📊 Mô Phỏng Kết Quả Thực Tế (Live Simulator)</h3>
                  <p>
                    Bảng tính tự động áp dụng tỷ lệ <b>{(boosterSettings.userCashbackPercent ?? 88.0).toFixed(1)}%</b> trên để bạn nhìn thấy ngay số tiền khách nhận được và tiền lời DealHoàn giữ lại cho các đơn mẫu:
                  </p>
                </div>
                <span className="text-xs bg-orange-100 text-orange-800 font-bold px-3 py-1.5 rounded-full border border-orange-200">
                  Tỷ lệ chia: {(boosterSettings.userCashbackPercent ?? 88.0).toFixed(1)}% / {(100 - (boosterSettings.userCashbackPercent ?? 88.0)).toFixed(1)}%
                </span>
              </div>

              <div className="table-responsive">
                <table className="admin-data-table" aria-label="Bảng mô phỏng kết quả">
                  <thead>
                    <tr>
                      <th>Sản phẩm mẫu</th>
                      <th>Ngành hàng</th>
                      <th className="text-right">Giá niêm yết</th>
                      <th className="text-right">Hoa hồng Shopee trả</th>
                      <th className="text-right">Tiền hoàn khách nhận</th>
                      <th className="text-right">Lợi nhuận DealHoàn</th>
                      <th className="text-center">Tỷ lệ hoàn trên đơn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SIMULATION_ITEMS.map((item, idx) => {
                      const res = calcSimResult(item.shopeeCommission, item.price, boosterSettings);
                      return (
                        <tr key={idx} className="admin-table-row">
                          <td className="font-bold text-stone-900">{item.name}</td>
                          <td className="text-stone-500 text-xs">{item.category}</td>
                          <td className="text-right font-medium text-stone-700">{formatVnd(item.price)}</td>
                          <td className="text-right font-bold text-stone-900 bg-stone-50">
                            {formatVnd(item.shopeeCommission)}
                          </td>
                          <td className="text-right font-black text-orange-600 bg-orange-50/50">
                            {formatVnd(res.userCashback)}
                          </td>
                          <td className="text-right font-bold text-emerald-700 bg-emerald-50/40">
                            {formatVnd(res.dealHoanProfit)}
                          </td>
                          <td className="text-center font-bold text-stone-800">
                            <span className="inline-block bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-xs">
                              {res.userRateOnPrice}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {(activeTab === "sync" || activeTab === "import") && (
          <section className="admin-import-container">
            {/* Header Hero Card */}
            <div className="admin-settings-card border-orange-200 bg-orange-50/20">
              <div className="admin-settings-header mb-4">
                <div>
                  <h3 className="text-orange-950 flex items-center gap-2">
                    <span>⚡</span> Tự Động Đồng Bộ Shopee 24/7 (Hoàn Toàn Không Cần Nạp CSV)
                  </h3>
                  <p>
                    Hệ thống vận hành <b>100% tự động qua Background Cron</b>: Cứ mỗi 15 phút, máy chủ tự kết nối Shopee Affiliate API, kéo toàn bộ đơn hàng mới phát sinh, đối chiếu mã <code>Sub_ID</code> của khách hàng, tính toán tiền hoàn và tự động cộng thẳng vào ví thành viên.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
                      autoSyncEnabled
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : "bg-stone-100 text-stone-600 border-stone-300"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${autoSyncEnabled ? "bg-emerald-500 animate-pulse" : "bg-stone-400"}`} />
                    <span>{autoSyncEnabled ? "🟢 Auto-Pilot: ĐANG BẬT" : "⚪ Auto-Pilot: TẮT"}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleAutoSync(!autoSyncEnabled)}
                    className="text-xs bg-white hover:bg-stone-50 border border-stone-300 font-bold px-3 py-1.5 rounded-lg text-stone-700 transition-colors"
                  >
                    {autoSyncEnabled ? "Tạm dừng" : "Bật lại"}
                  </button>
                </div>
              </div>

              {/* Cookie Input and Manual Trigger */}
              <div className="flex flex-col gap-3">
                <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                  <input
                    type="password"
                    placeholder="Dán Shopee Cookie (SPC_EC=... hoặc SPC_AFF_SESSION=...)"
                    value={shopeeCookie}
                    onChange={(e) => setShopeeCookie(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 text-xs font-mono rounded-xl border border-stone-300 focus:outline-none focus:border-orange-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleSyncShopee(false)}
                    disabled={isSyncingShopee || !shopeeCookie.trim()}
                    className="admin-btn-primary bg-orange-600 hover:bg-orange-700 whitespace-nowrap text-xs py-2.5 px-4 font-bold flex items-center gap-1.5"
                  >
                    {isSyncingShopee ? (
                      <>
                        <span className="animate-spin inline-block">🔄</span>
                        <span>Đang đồng bộ...</span>
                      </>
                    ) : (
                      <>
                        <span>🔄</span>
                        <span>Kích Hoạt Quét Ngay</span>
                      </>
                    )}
                  </button>
                </div>

                {shopeeSyncResult && (
                  <div
                    className={`p-3 rounded-lg text-xs font-medium ${
                      shopeeSyncResult.success
                        ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                        : "bg-red-100 text-red-900 border border-red-300"
                    }`}
                  >
                    {shopeeSyncResult.message}
                  </div>
                )}

                <div className="text-[11.5px] text-stone-500 flex items-center gap-1.5">
                  <span>💡</span>
                  <span>
                    <b>Cách lấy Cookie (1 lần duy nhất):</b> Đăng nhập <b>affiliate.shopee.vn</b> &rarr; nhấn <code>F12</code> &rarr; tab <code>Application</code> (hoặc <code>Storage</code>) &rarr; <code>Cookies</code> &rarr; copy giá trị <code>SPC_EC</code> hoặc toàn bộ chuỗi cookie dán vào đây.
                  </span>
                </div>
              </div>
            </div>

            {/* Shopee Open API & Hoa hồng Xtra Card */}
            <div className="admin-settings-card border-orange-200 bg-orange-50/30">
              <div className="admin-settings-header mb-3">
                <div>
                  <h3 className="text-stone-900 flex items-center gap-2">
                    <span className="text-xl">🎁</span> Shopee Open API & Hoa hồng Xtra (Hoàn tới 87%)
                  </h3>
                  <p>
                    Tự động kéo hàng loạt sản phẩm <b>Hoa hồng Xtra</b> (mức hoàn tiền khủng từ 30% đến 87%) trực tiếp từ sàn Shopee về hiển thị ưu tiên tại mục <b>Deal chớp nhoáng</b> trên trang chủ.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
                      hasShopeeOpenApi
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : "bg-amber-100 text-amber-800 border-amber-300"
                    }`}
                  >
                    <span>{hasShopeeOpenApi ? "🟢 Open API: ĐÃ KẾT NỐI (Tự động kéo Xtra)" : "⚪ Chưa cắm Shopee Open API"}</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="p-3 bg-white rounded-xl border border-orange-200 text-xs text-stone-700 flex flex-col gap-1.5">
                  <span className="font-semibold text-orange-950 flex items-center gap-1.5">
                    <span>💡</span> <b>Cách lấy App ID và Secret Key (1 phút):</b>
                  </span>
                  <ol className="list-decimal pl-4 space-y-1 text-stone-600">
                    <li>Đăng nhập <b>affiliate.shopee.vn</b> (trang Tiếp thị liên kết Shopee).</li>
                    <li>Ở thanh menu bên trái, cuộn xuống dưới cùng và click vào mục <b>Open API</b>.</li>
                    <li>Copy mã <b>App ID</b> và <b>Secret</b> dán vào 2 ô bên dưới rồi nhấn <b>Lưu & Kích hoạt</b>.</li>
                  </ol>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Shopee App ID:</label>
                    <input
                      type="text"
                      placeholder="Dán App ID (ví dụ: 17333200656)..."
                      value={shopeeAppId}
                      onChange={(e) => setShopeeAppId(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-stone-300 focus:outline-none focus:border-orange-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700 mb-1">Shopee Secret Key:</label>
                    <input
                      type="password"
                      placeholder="Dán Secret Key..."
                      value={shopeeSecret}
                      onChange={(e) => setShopeeSecret(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-stone-300 focus:outline-none focus:border-orange-500 bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveShopeeOpenApi}
                    disabled={isSavingOpenApi || !shopeeAppId.trim()}
                    className="admin-btn-primary bg-orange-600 hover:bg-orange-700 text-white whitespace-nowrap text-xs py-2.5 px-4 font-bold flex items-center gap-1.5"
                  >
                    {isSavingOpenApi ? "Đang lưu..." : "💾 Lưu & Kích hoạt Hoa hồng Xtra"}
                  </button>
                </div>

                {openApiResult && (
                  <div
                    className={`p-3 rounded-lg text-xs font-medium ${
                      openApiResult.success
                        ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                        : "bg-red-100 text-red-900 border border-red-300"
                    }`}
                  >
                    {openApiResult.message}
                  </div>
                )}
              </div>
            </div>

            {/* Nhập hàng loạt sản phẩm Hoa hồng Xtra (1-Click) */}
            <div className="admin-settings-card border-rose-200 bg-rose-50/30">
              <div className="admin-settings-header mb-3">
                <div>
                  <h3 className="text-stone-900 flex items-center gap-2">
                    <span className="text-xl">⚡</span> Nhập hàng loạt sản phẩm Hoa hồng Xtra lên Deal chớp nhoáng
                  </h3>
                  <p>
                    Giải pháp bán tự động nhanh nhất khi chưa có Open API: Tích chọn các shop hoa hồng 70% - 87% &rarr; bấm nút <b>&quot;Lấy link hàng loạt&quot;</b> trên Shopee Affiliate &rarr; Dán vào đây để đưa thẳng lên trang chủ.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-3 py-1.5 rounded-full border bg-rose-100 text-rose-800 border-rose-300">
                    Đang ghim: {curatedXtraList.length} deal Xtra
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700 mb-1">
                    Danh sách link Shopee (Mỗi dòng 1 link - Copy từ nút &quot;Lấy link hàng loạt&quot; hoặc link sản phẩm):
                  </label>
                  <textarea
                    rows={4}
                    placeholder={`https://shopee.vn/product/1547687617/43120673024\nhttps://shopee.vn/product/1660251166/43975778650\nhttps://s.shopee.vn/xyz...`}
                    value={xtraUrls}
                    onChange={(e) => setXtraUrls(e.target.value)}
                    className="w-full p-3 text-xs font-mono rounded-xl border border-stone-300 focus:outline-none focus:border-rose-500 bg-white"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold text-stone-700 whitespace-nowrap">% Hoa hồng Xtra:</label>
                    <input
                      type="number"
                      min={10}
                      max={95}
                      value={xtraCommission}
                      onChange={(e) => setXtraCommission(e.target.value)}
                      className="w-20 px-2.5 py-1.5 text-xs font-bold text-center rounded-lg border border-stone-300 bg-white focus:outline-none focus:border-rose-500"
                    />
                    <span className="text-xs text-stone-500">% (Mặc định 70% từ các Shop Xtra)</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {curatedXtraList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteXtraDeal("all")}
                        className="px-3 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        🗑️ Xóa tất cả ({curatedXtraList.length})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleImportXtraDeals}
                      disabled={isImportingXtra || !xtraUrls.trim()}
                      className="admin-btn-primary bg-rose-600 hover:bg-rose-700 text-white whitespace-nowrap text-xs py-2.5 px-4 font-bold flex items-center gap-1.5"
                    >
                      {isImportingXtra ? "Đang xử lý nạp..." : "🚀 Nạp ngay lên Deal chớp nhoáng"}
                    </button>
                  </div>
                </div>

                {xtraImportResult && (
                  <div
                    className={`p-3 rounded-lg text-xs font-medium ${
                      xtraImportResult.success
                        ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                        : "bg-red-100 text-red-900 border border-red-300"
                    }`}
                  >
                    {xtraImportResult.message}
                  </div>
                )}

                {curatedXtraList.length > 0 && (
                  <div className="mt-2 bg-white rounded-xl border border-stone-200 p-3 max-h-56 overflow-y-auto">
                    <div className="text-[11px] font-bold text-stone-600 uppercase mb-2">Các sản phẩm Hoa hồng Xtra đang hiển thị ({curatedXtraList.length}):</div>
                    <div className="space-y-1.5">
                      {curatedXtraList.slice(0, 10).map((deal: any) => (
                        <div key={deal.id} className="flex items-center justify-between text-xs py-1 border-b border-stone-100 last:border-none">
                          <div className="truncate flex-1 pr-2">
                            <span className="font-semibold text-stone-800">{deal.name}</span>
                            <span className="text-stone-500 ml-2">({Number(deal.price).toLocaleString("vi-VN")}đ · Hoàn {Number(deal.cashback).toLocaleString("vi-VN")}đ)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteXtraDeal(deal.id)}
                            className="text-stone-400 hover:text-red-500 text-xs px-1"
                            title="Xóa deal này"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* AccessTrade & TikTok Shop Config Card */}
            <div className="admin-settings-card border-stone-200 bg-stone-50/40">
              <div className="admin-settings-header mb-3">
                <div>
                  <h3 className="text-stone-900 flex items-center gap-2">
                    <span className="text-xl">🎵</span> TikTok Shop & AccessTrade Integration (Real-time Webhook)
                  </h3>
                  <p>
                    Kết nối AccessTrade API để tự động bọc link TikTok Shop gắn mã thành viên (<code>Sub_ID</code>) và nhận webhook nạp tiền hoàn thời gian thực khi khách mua hàng.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
                      accesstradeToken.trim()
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : "bg-amber-100 text-amber-800 border-amber-300"
                    }`}
                  >
                    <span>{accesstradeToken.trim() ? "🟢 TikTok Shop: ĐÃ CẮM TOKEN" : "⚪ Chưa có AccessTrade Token"}</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                  <input
                    type="password"
                    placeholder="Dán mã AccessTrade API Token (Lấy tại: Công cụ -> AccessTrade API)..."
                    value={accesstradeToken}
                    onChange={(e) => setAccesstradeToken(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 text-xs font-mono rounded-xl border border-stone-300 focus:outline-none focus:border-stone-800 bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleSaveAccesstradeToken}
                    disabled={isSavingAtToken || !accesstradeToken.trim()}
                    className="admin-btn-primary bg-stone-900 hover:bg-black text-white whitespace-nowrap text-xs py-2.5 px-4 font-bold flex items-center gap-1.5"
                  >
                    {isSavingAtToken ? "Đang lưu..." : "💾 Lưu AccessTrade Token"}
                  </button>
                </div>

                {atTokenResult && (
                  <div
                    className={`p-3 rounded-lg text-xs font-medium ${
                      atTokenResult.success
                        ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                        : "bg-red-100 text-red-900 border border-red-300"
                    }`}
                  >
                    {atTokenResult.message}
                  </div>
                )}

                <div className="bg-white p-3 rounded-xl border border-stone-200 text-xs flex flex-col gap-1.5">
                  <div className="font-semibold text-stone-800 flex items-center gap-1.5">
                    <span>🔗</span> URL Postback / Webhook nhận đơn TikTok tự động:
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-stone-100 rounded text-[11.5px] font-mono text-stone-700 select-all overflow-x-auto">
                      {typeof window !== "undefined" ? `${window.location.origin}/api/affiliate/webhook` : "https://deal-hoan.vercel.app/api/affiliate/webhook"}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        const url = typeof window !== "undefined" ? `${window.location.origin}/api/affiliate/webhook` : "https://deal-hoan.vercel.app/api/affiliate/webhook";
                        navigator.clipboard.writeText(url);
                        setToastMsg("📋 Đã copy link Postback Webhook!");
                        setTimeout(() => setToastMsg(null), 3000);
                      }}
                      className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded text-xs transition-colors"
                    >
                      Copy URL
                    </button>
                  </div>
                  <span className="text-[11px] text-stone-500">
                    Dán URL này vào mục <b>Công cụ &rarr; Postback</b> trên trang <b>pub.accesstrade.vn</b> để nhận thông báo đơn hàng theo thời gian thực (Real-time).
                  </span>
                </div>
              </div>
            </div>

            {/* KPI Status Grid */}
            <div className="admin-import-stats-grid">
              <div className="admin-import-stat-card">
                <span className="admin-import-stat-title">Chu kỳ quét tự động</span>
                <span className="admin-import-stat-value text-orange-600">Mỗi 15 phút</span>
                <span className="admin-import-stat-note">Chạy ngầm 24/7 không cần mở web</span>
              </div>

              <div className="admin-import-stat-card highlight">
                <span className="admin-import-stat-title">Lần quét gần nhất</span>
                <span className="admin-import-stat-value text-stone-900">
                  {lastSyncAt ? formatDate(lastSyncAt) : "Chưa có"}
                </span>
                <span className="admin-import-stat-note">
                  {lastSyncResult || "Sẵn sàng hoạt động"}
                </span>
              </div>

              <div className="admin-import-stat-card">
                <span className="admin-import-stat-title">Đơn hàng Shopee đã kéo</span>
                <span className="admin-import-stat-value text-emerald-700">
                  {recentSyncedOrders.length} đơn
                </span>
                <span className="admin-import-stat-note">Trong 30 ngày gần nhất</span>
              </div>

              <div className="admin-import-stat-card highlight">
                <span className="admin-import-stat-title">Cơ chế bảo vệ</span>
                <span className="admin-import-stat-value text-emerald-700">Zero Loss Guard</span>
                <span className="admin-import-stat-note">Giữ lại {boosterSettings.safetyMarginPercent}% biên an toàn</span>
              </div>
            </div>

            {/* Synced Orders Table */}
            <div className="admin-settings-card">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h4 className="text-base font-bold text-stone-900 m-0 flex items-center gap-2">
                  <span>📋</span> Đơn Hàng Shopee Đồng Bộ Tự Động Gần Nhất ({recentSyncedOrders.length})
                </h4>
                <button
                  type="button"
                  onClick={() => handleSyncShopee(false)}
                  disabled={isSyncingShopee || !shopeeCookie.trim()}
                  className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                >
                  <span>🔄</span> Làm mới danh sách
                </button>
              </div>

              {recentSyncedOrders.length === 0 ? (
                <div className="p-8 text-center bg-stone-50 rounded-xl border border-dashed border-stone-200 text-stone-500 text-sm">
                  <p className="text-2xl mb-2">🤖</p>
                  <p className="font-semibold text-stone-700">Chưa có đơn hàng nào được ghi nhận</p>
                  <p className="text-xs text-stone-500 mt-1">
                    Khi khách hàng mua qua liên kết DealHoàn và Cron Job 15 phút quét xong, toàn bộ đơn hàng sẽ tự động hiển thị tại đây.
                  </p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="admin-data-table" aria-label="Danh sách người dùng và số dư">
                    <thead>
                      <tr>
                        <th>Mã đơn Shopee</th>
                        <th>Thành viên DealHoàn (SubID)</th>
                        <th>Sản phẩm</th>
                        <th className="text-right">Giá trị đơn</th>
                        <th className="text-right">Hoa hồng sàn</th>
                        <th className="text-right">Tiền hoàn về ví</th>
                        <th className="text-center">Trạng thái</th>
                        <th className="text-right">Thời gian</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSyncedOrders.map((ord, idx) => {
                        const matchedUser = users.find((u) => ord.userId && u.id.startsWith(ord.userId));
                        return (
                          <tr key={idx} className="admin-table-row">
                            <td className="font-mono text-xs font-bold text-stone-900">{ord.orderId}</td>
                            <td>
                              {matchedUser ? (
                                <div>
                                  <div className="font-bold text-emerald-800 text-xs">
                                    {matchedUser.fullName || matchedUser.email}
                                  </div>
                                  <div className="text-[11px] text-stone-400 font-mono">{ord.subId}</div>
                                </div>
                              ) : (
                                <div>
                                  <span className="text-xs font-mono font-bold text-orange-700">{ord.subId}</span>
                                  <span className="block text-[10px] text-stone-400">ID: {ord.userId}</span>
                                </div>
                              )}
                            </td>
                            <td className="max-w-[220px] truncate text-xs text-stone-700" title={ord.productName}>
                              {ord.productName}
                            </td>
                            <td className="text-right text-xs font-medium">{formatVnd(ord.orderValue)}</td>
                            <td className="text-right text-xs font-semibold text-stone-800">
                              {formatVnd(ord.commissionAmount)}
                            </td>
                            <td className="text-right text-xs font-black text-emerald-700 bg-emerald-50/50">
                              +{formatVnd(ord.cashbackAmount)}
                            </td>
                            <td className="text-center">
                              <span
                                className={`status-badge text-[11px] ${
                                  ord.status === "completed"
                                    ? "badge-active"
                                    : ord.status === "rejected"
                                    ? "badge-suspended"
                                    : "badge-pending"
                                }`}
                              >
                                {ord.status === "completed"
                                  ? "Đã duyệt"
                                  : ord.status === "rejected"
                                  ? "Đã hủy"
                                  : "Chờ duyệt"}
                              </span>
                            </td>
                            <td className="text-right text-xs text-stone-500 whitespace-nowrap">
                              {ord.orderedAt ? formatDate(ord.orderedAt) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* MODAL CHI TIẾT NGƯỜI DÙNG */}
      {selectedUser && (
        <div className="admin-modal-backdrop" onClick={() => setSelectedUser(null)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="admin-modal-header">
              <div className="modal-user-header">
                <div className="modal-user-avatar">
                  {selectedUser.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedUser.avatarUrl} alt={selectedUser.fullName} />
                  ) : (
                    <div className="user-avatar-fallback">{initials(selectedUser.fullName)}</div>
                  )}
                </div>
                <div>
                  <div className="modal-name-row">
                    <h3>{selectedUser.fullName}</h3>
                    <span className="modal-user-id">Mã: {selectedUser.refCode}</span>
                  </div>
                  <p className="modal-user-email">{selectedUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setSelectedUser(null)}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="admin-modal-body">
              {/* Section 1: Thống kê ví của User (Đồng bộ thứ tự và tên gọi theo Modal ví của user: Chờ nền tảng duyệt -> Có thể rút -> Đã nhận) */}
              <div className="modal-section-grid">
                <div className="modal-stat-box amber-box">
                  <span className="box-label">CHỜ NỀN TẢNG DUYỆT</span>
                  <span className="box-val amber-text">{formatVnd(selectedUser.pendingBalance)}</span>
                  <span className="box-hint">Đang đối soát sàn</span>
                </div>
                <div className="modal-stat-box green-box">
                  <span className="box-label">CÓ THỂ RÚT</span>
                  <span className="box-val green-text">{formatVnd(selectedUser.balance)}</span>
                  <span className="box-hint">Có thể rút ngay</span>
                </div>
                <div className="modal-stat-box blue-box">
                  <span className="box-label">ĐÃ NHẬN</span>
                  <span className="box-val blue-text">{formatVnd(selectedUser.totalWithdrawn)}</span>
                  <span className="box-hint">Đã nhận về ngân hàng</span>
                </div>
              </div>

              {/* Section 2: Thông tin ngân hàng & QR Napas */}
              <div className="modal-card-block">
                <div className="block-title-row">
                  <div className="flex items-center gap-2">
                    <span className="block-icon">🏦</span>
                    <h4 className="block-title">Tài Khoản Ngân Hàng Nhận Tiền</h4>
                  </div>
                  {selectedUser.isBankConfigured && (
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          `${selectedUser.bankName} - STK: ${selectedUser.bankAccountNo} - ${selectedUser.bankAccountName}`,
                          "Toàn bộ thông tin ngân hàng"
                        )
                      }
                      className="btn-copy-all"
                    >
                      📋 Copy đầy đủ
                    </button>
                  )}
                </div>

                {selectedUser.isBankConfigured ? (
                  <div className="bank-detail-grid">
                    <div className="bank-info-fields">
                      <div className="info-field">
                        <label>Ngân hàng nhận tiền:</label>
                        <div className="field-val highlight-bank">{selectedUser.bankName}</div>
                      </div>

                      <div className="info-field">
                        <label>Số tài khoản:</label>
                        <div className="field-val-copy-row">
                          <span className="field-stk">{selectedUser.bankAccountNo}</span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(selectedUser.bankAccountNo, "Số tài khoản", "modal-stk")
                            }
                            className="btn-copy-mini"
                          >
                            {copiedId === "modal-stk" ? "✓ Đã chép" : "Sao chép"}
                          </button>
                        </div>
                      </div>

                      <div className="info-field">
                        <label>Tên chủ tài khoản:</label>
                        <div className="field-val font-semibold">{selectedUser.bankAccountName}</div>
                      </div>

                      <div className="info-field">
                        <label>Cú pháp chuyển khoản gợi ý:</label>
                        <div className="field-val-copy-row">
                          <span className="field-note">DealHoan rut tien {selectedUser.refCode}</span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                `DealHoan rut tien ${selectedUser.refCode}`,
                                "Cú pháp chuyển khoản"
                              )
                            }
                            className="btn-copy-mini"
                          >
                            Sao chép
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* VietQR Preview cho Admin quét app ngân hàng thanh toán tức thì */}
                    <div className="vietqr-box">
                      <div className="vietqr-label">Quét mã VietQR chuyển khoản nhanh:</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://img.vietqr.io/image/${getVietQrBankCode(
                          selectedUser.bankName
                        )}-${selectedUser.bankAccountNo}-compact2.png?amount=${
                          selectedUser.balance > 0 ? selectedUser.balance : 50000
                        }&addInfo=DealHoan%20${selectedUser.refCode}`}
                        alt="Mã VietQR"
                        className="vietqr-img"
                        loading="lazy"
                      />
                      <span className="vietqr-hint">Hỗ trợ tất cả ứng dụng ngân hàng Napas247</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center text-stone-500 text-sm">
                    Không có thông tin
                  </div>
                )}
              </div>

              {/* Section 3: Điều chỉnh số dư Admin */}
              <div className="modal-card-block">
                <div className="block-title-row">
                  <div className="flex items-center gap-2">
                    <span className="block-icon">⚙️</span>
                    <h4 className="block-title">Điều Chỉnh Số Dư</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdjustBalanceMode(!adjustBalanceMode)}
                    className="btn-toggle-adjust"
                  >
                    {adjustBalanceMode ? "Hủy điều chỉnh" : "Sửa số dư ví"}
                  </button>
                </div>

                {adjustBalanceMode && (
                  <div className="adjust-form">
                    <div className="adjust-grid">
                      <div className="form-group">
                        <label>Số dư khả dụng (VNĐ):</label>
                        <input
                          type="number"
                          value={newBalance}
                          onChange={(e) => setNewBalance(Number(e.target.value))}
                          className="admin-input"
                          step={1000}
                        />
                      </div>
                      <div className="form-group">
                        <label>Tiền chờ duyệt (VNĐ):</label>
                        <input
                          type="number"
                          value={newPending}
                          onChange={(e) => setNewPending(Number(e.target.value))}
                          className="admin-input"
                          step={1000}
                        />
                      </div>
                    </div>
                    <div className="form-group mt-2">
                      <label>Lý do điều chỉnh:</label>
                      <input
                        type="text"
                        placeholder="VD: Thưởng hoàn tiền chiến dịch, cộng thủ công đơn hàng..."
                        value={adjustNote}
                        onChange={(e) => setAdjustNote(e.target.value)}
                        className="admin-input"
                      />
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAdjustBalanceMode(false)}
                        className="admin-btn-secondary"
                      >
                        Đóng
                      </button>
                      <button
                        type="button"
                        disabled={isUpdatingUser}
                        onClick={handleSaveBalance}
                        className="admin-btn-primary"
                      >
                        {isUpdatingUser ? "Đang lưu..." : "Xác nhận lưu thay đổi"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: Đơn Hàng Hoàn Tiền */}
              <div className="modal-card-block">
                <div className="block-title-row">
                  <div className="flex items-center gap-2">
                    <span className="block-icon">🛍️</span>
                    <h4 className="block-title">
                      Đơn Hàng Hoàn Tiền ({userOrders.length})
                    </h4>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={isSimulatingOrder}
                      onClick={() => handleSimulateOrder("TikTok Shop", "completed")}
                      className="px-2.5 py-1 text-xs font-semibold rounded-md bg-stone-900 hover:bg-stone-800 text-white transition-all shadow-sm disabled:opacity-50"
                      title="Mô phỏng 1 đơn TikTok Shop đã mua thành công, cộng ngay 35.000đ vào số dư khả dụng"
                    >
                      {isSimulatingOrder ? "..." : "+ Test TikTok (+35k)"}
                    </button>
                    <button
                      type="button"
                      disabled={isSimulatingOrder}
                      onClick={() => handleSimulateOrder("Shopee", "pending")}
                      className="px-2.5 py-1 text-xs font-semibold rounded-md bg-orange-600 hover:bg-orange-700 text-white transition-all shadow-sm disabled:opacity-50"
                      title="Mô phỏng 1 đơn Shopee đang chờ duyệt, cộng 35.000đ vào tiền chờ duyệt"
                    >
                      {isSimulatingOrder ? "..." : "+ Test Shopee (Chờ)"}
                    </button>
                  </div>
                </div>

                {loadingOrders ? (
                  <div className="p-4 text-center text-stone-500 text-sm">Đang tải danh sách đơn hàng...</div>
                ) : userOrders.length === 0 ? (
                  <div className="p-4 text-center text-stone-500 text-sm">
                    Không có thông tin
                  </div>
                ) : (
                  <div className="modal-withdrawals-list">
                    {userOrders.map((ord) => (
                      <div key={ord.id || ord.order_id} className="modal-w-item">
                        <div className="w-item-left">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block px-1.5 py-0.5 text-[11px] font-bold rounded ${
                              ord.platform?.toLowerCase().includes("tiktok")
                                ? "bg-black text-white"
                                : "bg-orange-500 text-white"
                            }`}>
                              {ord.platform}
                            </span>
                            <span className="text-xs font-mono font-medium text-stone-500">
                              #{ord.order_id}
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-stone-800 mt-1">
                            {ord.product_name || "Sản phẩm hoàn tiền"}
                          </div>
                          <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-3">
                            <span>Giá trị đơn: <b>{formatVnd(ord.order_value || 0)}</b></span>
                            <span>Hoàn tiền: <b className="text-emerald-600">+{formatVnd(ord.cashback_amount)}</b></span>
                          </div>
                          <div className="w-item-date mt-1">{formatDate(ord.created_at || ord.ordered_at || "")}</div>
                          {ord.note && <div className="w-item-note">{ord.note}</div>}
                        </div>
                        <div className="w-item-right">
                          {ord.status === "completed" && (
                            <span className="w-badge w-completed">✅ Đã hoàn ví</span>
                          )}
                          {ord.status === "rejected" && (
                            <span className="w-badge w-rejected">❌ Bị hủy</span>
                          )}
                          {ord.status === "pending" && (
                            <div className="pending-actions-wrap">
                              <span className="w-badge w-pending">⏳ Chờ duyệt</span>
                              <div className="flex gap-1 mt-2">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOrderStatus(ord.order_id, ord.platform, "completed")}
                                  className="btn-approve-mini"
                                  title="Duyệt đơn và cộng tiền vào ví khả dụng của user"
                                >
                                  ✓ Duyệt
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateOrderStatus(ord.order_id, ord.platform, "rejected")}
                                  className="btn-reject-mini"
                                  title="Từ chối đơn hoàn tiền này"
                                >
                                  ✕ Hủy
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 5: Lịch sử các lệnh rút tiền */}
              <div className="modal-card-block">
                <div className="block-title-row">
                  <div className="flex items-center gap-2">
                    <span className="block-icon">📋</span>
                    <h4 className="block-title">
                      Lịch Sử Yêu Cầu Rút Tiền ({userWithdrawals.length})
                    </h4>
                  </div>
                </div>

                {loadingWithdrawals ? (
                  <div className="p-4 text-center text-stone-500">Đang tải lịch sử rút tiền...</div>
                ) : userWithdrawals.length === 0 ? (
                  <div className="p-4 text-center text-stone-500 text-sm">
                    Không có thông tin
                  </div>
                ) : (
                  <div className="modal-withdrawals-list">
                    {userWithdrawals.map((w) => (
                      <div key={w.id} className="modal-w-item">
                        <div className="w-item-left">
                          <div className="w-item-amount">−{formatVnd(w.amount)}</div>
                          <div className="w-item-bank">
                            {w.bank_name} · <b>{w.bank_account_no}</b> ({w.bank_account_name})
                          </div>
                          <div className="w-item-date">{formatDate(w.created_at)}</div>
                          {w.note && <div className="w-item-note">Ghi chú: {w.note}</div>}
                        </div>
                        <div className="w-item-right">
                          {w.status === "completed" && (
                            <span className="w-badge w-completed">✅ Đã chuyển</span>
                          )}
                          {w.status === "rejected" && (
                            <span className="w-badge w-rejected">❌ Bị từ chối</span>
                          )}
                          {w.status === "pending" && (
                            <div className="pending-actions-wrap">
                              <span className="w-badge w-pending">⏳ Chờ xử lý</span>
                              <div className="flex gap-1 mt-2">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateWithdrawalStatus(w.id, "completed")}
                                  className="btn-approve-mini"
                                  title="Xác nhận đã chuyển tiền thành công"
                                >
                                  ✓ Duyệt
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateWithdrawalStatus(w.id, "rejected")}
                                  className="btn-reject-mini"
                                  title="Từ chối lệnh rút tiền này"
                                >
                                  ✕ Từ chối
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="admin-modal-footer">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="admin-btn-secondary"
              >
                Đóng cửa sổ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
