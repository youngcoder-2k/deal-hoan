"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowClockwise,
  DownloadSimple,
  CaretRight,
  CaretDown,
  Bank,
  Users,
  HandCoins,
  Percent,
  CloudArrowUp,
  FileCsv,
  CheckCircle,
  WarningCircle,
  Receipt,
  ShoppingCart,
  GearSix,
  FloppyDisk,
  Lightning,
  Key,
  Globe,
  Copy,
  Check,
  Clock,
  XCircle,
  X,
  MagnifyingGlass,
  Crown,
  ChatDots,
  ShoppingBag,
} from "@phosphor-icons/react";
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
        const balance = typeof ov.balance === "number" ? ov.balance : u.balance;
        const totalWithdrawn = u.totalWithdrawn;
        const pendingBalance = typeof ov.pendingBalance === "number" ? ov.pendingBalance : u.pendingBalance;
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
  const [withdrawalFilter, setWithdrawalFilter] = useState<"all" | "pending" | "completed" | "rejected">("pending");
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const [copiedSTK, setCopiedSTK] = useState<string | null>(null);
  const [approvingWithdrawalId, setApprovingWithdrawalId] = useState<string | null>(null);
  const [qrWithdrawal, setQrWithdrawal] = useState<{
    id: string;
    amount: number;
    bankName: string;
    bankAccountNo: string;
    bankAccountName: string;
    refCode?: string;
  } | null>(null);

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

  // Lọc sạch các đơn test / fake (SP_..., TT_..., đơn test)
  const filteredRecentSyncedOrders = useMemo(() => {
    return recentSyncedOrders.filter((ord) => {
      const id = String(ord.orderId || "");
      const name = String(ord.productName || "").toLowerCase();
      return !id.startsWith("SP_") && !id.startsWith("TT_") && !name.includes("test");
    });
  }, [recentSyncedOrders]);

  const [showCookieGuide, setShowCookieGuide] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [csvUploadResult, setCsvUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingCsv(true);
      setCsvUploadResult(null);
      const text = await file.text();
      const res = await fetch("/api/admin/shopee/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminFetchHeaders() },
        body: JSON.stringify({ csvContent: text }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCsvUploadResult({ success: true, message: data.message });
        setToastMsg("🎉 " + data.message);
        setTimeout(() => setToastMsg(null), 4000);
        if (Array.isArray(data.syncedOrders) && data.syncedOrders.length > 0) {
          setRecentSyncedOrders((prev) => [...data.syncedOrders, ...prev]);
        }
        await reloadUsers();
      } else {
        setCsvUploadResult({ success: false, message: data.error || "Không thể nạp file CSV." });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi đọc file CSV";
      setCsvUploadResult({ success: false, message: msg });
    } finally {
      setIsUploadingCsv(false);
      if (csvFileInputRef.current) csvFileInputRef.current.value = "";
    }
  };

  const getAdminFetchHeaders = (): Record<string, string> => {
    if (typeof window === "undefined") return {};
    const key = new URLSearchParams(window.location.search).get("key") || "";
    return key ? { "x-admin-key": key } : {};
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
          message: data.message || data.error || "Không thể đồng bộ tự động từ Shopee. Vui lòng thử nạp bằng File CSV (Cách 2).",
        });
        setLastSyncResult("Lỗi: " + (data.message || data.error || "Không thể đồng bộ"));
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
      const key = urlParams.get("key");
      if (key) {
        document.cookie = `dealhoan_admin_key=${encodeURIComponent(key)}; path=/; max-age=2592000; SameSite=Lax`;
      }
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

  const [withdrawalSort, setWithdrawalSort] = useState<"created_desc" | "amount_desc" | "amount_asc" | "created_asc">("created_desc");
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [withdrawalPageSize, setWithdrawalPageSize] = useState(10);

  const filteredWithdrawals = useMemo(() => {
    return allWithdrawals.filter((w) => {
      if (withdrawalFilter !== "all" && w.status !== withdrawalFilter) {
        return false;
      }
      if (withdrawalSearch.trim()) {
        const q = withdrawalSearch.trim().toLowerCase();
        const matchEmail = (w.userEmail || "").toLowerCase().includes(q);
        const matchName = (w.userName || "").toLowerCase().includes(q);
        const matchBank = (w.bankName || "").toLowerCase().includes(q);
        const matchSTK = (w.bankAccountNo || "").toLowerCase().includes(q);
        const matchAccName = (w.bankAccountName || "").toLowerCase().includes(q);
        const matchRef = (w.userRefCode || "").toLowerCase().includes(q);
        const matchId = (w.id || "").toLowerCase().includes(q);
        return matchEmail || matchName || matchBank || matchSTK || matchAccName || matchRef || matchId;
      }
      return true;
    }).sort((a, b) => {
      if (withdrawalSort === "created_asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (withdrawalSort === "amount_desc") return (b.amount || 0) - (a.amount || 0);
      if (withdrawalSort === "amount_asc") return (a.amount || 0) - (b.amount || 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [allWithdrawals, withdrawalFilter, withdrawalSearch, withdrawalSort]);

  const totalWithdrawalPages = Math.max(1, Math.ceil(filteredWithdrawals.length / withdrawalPageSize));
  const safeWithdrawalPage = Math.min(Math.max(1, withdrawalPage), totalWithdrawalPages);
  const paginatedWithdrawals = filteredWithdrawals.slice(
    (safeWithdrawalPage - 1) * withdrawalPageSize,
    safeWithdrawalPage * withdrawalPageSize
  );

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

  // Lọc sạch các đơn test / fake trong modal chi tiết thành viên
  const filteredUserOrders = useMemo(() => {
    return userOrders.filter((ord) => {
      const id = String(ord.order_id || "");
      const name = String(ord.product_name || "").toLowerCase();
      const note = String(ord.note || "").toLowerCase();
      return !id.startsWith("SP_") && !id.startsWith("TT_") && !name.includes("test") && !note.includes("test");
    });
  }, [userOrders]);

  // Modal điều chỉnh số dư
  const [adjustBalanceMode, setAdjustBalanceMode] = useState(false);
  const [newBalance, setNewBalance] = useState<number>(0);
  const [newPending, setNewPending] = useState<number>(0);
  const [adjustNote, setAdjustNote] = useState("");
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [showOrdersDropdown, setShowOrdersDropdown] = useState(false);
  const [showWithdrawalsDropdown, setShowWithdrawalsDropdown] = useState(false);

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
    setShowOrdersDropdown(false);
    setShowWithdrawalsDropdown(false);
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

  // Cập nhật trạng thái đơn hàng (Duyệt, Về Chờ duyệt hoặc Hủy)
  const handleUpdateOrderStatus = async (
    orderId: string,
    platform: string,
    newStatus: "pending" | "completed" | "rejected"
  ) => {
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          platform,
          status: newStatus,
          note:
            newStatus === "completed"
              ? "Admin đã duyệt hoàn tiền"
              : newStatus === "pending"
              ? "Admin chuyển về Chờ duyệt (đối soát T+15)"
              : "Admin từ chối đơn hàng",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(
          newStatus === "completed"
            ? "✅ Đã duyệt hoàn tiền thành công!"
            : newStatus === "pending"
            ? "⏱️ Đã chuyển về Chờ duyệt (đang đối soát T+15)!"
            : "❌ Đã từ chối đơn hàng!"
        );
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
      const aTotal = (a.balance || 0) + (a.pendingBalance || 0);
      const bTotal = (b.balance || 0) + (b.pendingBalance || 0);
      if (bTotal !== aTotal) return bTotal - aTotal;
      if (b.balance !== a.balance) return b.balance - a.balance;
      if (b.pendingBalance !== a.pendingBalance) return b.pendingBalance - a.pendingBalance;
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
    <div className={`admin-page-container ${design.root} ${design.users}`}>
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
          <Users size={17} weight={activeTab === "users" ? "bold" : "regular"} />
          <span>Người dùng</span>
        </button>
        <button
          type="button"
          className={`admin-nav-tab-btn ${activeTab === "withdrawals" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("withdrawals");
            loadAllWithdrawals();
          }}
        >
          <HandCoins size={17} weight={activeTab === "withdrawals" ? "bold" : "regular"} />
          <span>Duyệt rút tiền</span>
        </button>
        <button
          type="button"
          className={`admin-nav-tab-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("settings");
            loadBoosterSettings();
          }}
        >
          <Percent size={17} weight={activeTab === "settings" ? "bold" : "regular"} />
          <span>Tỷ lệ hoàn tiền</span>
        </button>
        <button
          type="button"
          className={`admin-nav-tab-btn ${activeTab === "sync" || activeTab === "import" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("sync");
            loadShopeeSyncConfig();
          }}
        >
          <CloudArrowUp size={17} weight={activeTab === "sync" || activeTab === "import" ? "bold" : "regular"} />
          <span>Nạp đơn Shopee</span>
        </button>
      </div>

      <main className="admin-main">
        {activeTab === "users" && (
          <>
            <div className={design.titleBar}>
              <div><h1>Người dùng &amp; số dư</h1></div>
              <div className="admin-actions-area"><button type="button" className="admin-btn-secondary" onClick={refreshData} disabled={loading}><ArrowClockwise size={18} className={loading ? "animate-spin" : ""} />{loading ? "Đang tải…" : "Làm mới"}</button><button type="button" className="admin-btn-primary" onClick={exportToCsv}><DownloadSimple size={18} />Xuất CSV</button></div>
            </div>
            {/* Banner thông báo khi chưa có cấu hình Supabase */}
            {!isRealData && (
          <div className="admin-demo-alert">
            <span className="demo-alert-icon"><WarningCircle size={22} weight="fill" className="text-amber-600 shrink-0" /></span>
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
              <div className="empty-icon"><MagnifyingGlass size={36} weight="duotone" className="text-stone-400 mx-auto" /></div>
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
                    <th scope="col" className="w-[45%]">Người dùng</th>
                    <th scope="col" className={`w-[20%] ${design.numeric}`}>Chờ hoàn</th>
                    <th scope="col" className={`w-[20%] ${design.numeric}`}>Khả dụng</th>
                    <th scope="col" className="w-[15%] text-right"><span className={design.srOnly}>Thao tác</span></th>
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
                                <Crown size={13} weight="fill" className="text-amber-500 inline" />
                              </span>
                            )}
                          </div>
                          <div className="user-cell-texts">
                            <span className="user-name-text">{u.fullName}</span>
                            <span className="user-email-text">{u.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Cột 2: Tiền chờ hoàn */}
                      <td className={design.numeric}>
                        {u.pendingBalance > 0 ? (
                          <strong className="text-stone-900 font-bold">{formatVnd(u.pendingBalance)}</strong>
                        ) : (
                          <span className="text-stone-400">0đ</span>
                        )}
                      </td>

                      {/* Cột 3: Số dư khả dụng */}
                      <td className={design.numeric}>
                        {u.balance > 0 ? (
                          <strong className="text-[#109452] font-bold">{formatVnd(u.balance)}</strong>
                        ) : (
                          <span className="text-stone-400">0đ</span>
                        )}
                      </td>

                      {/* Cột 4: Thao tác */}
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
            <section className="admin-kpi-grid withdrawals-kpi-grid" aria-label="Thống kê rút tiền">
              <div className="admin-kpi-card">
                <span className="kpi-label">Lệnh chờ duyệt</span>
                <strong className={`kpi-value ${pendingWithdrawalsCount > 0 ? "text-amber-600" : ""}`}>
                  {pendingWithdrawalsCount} <span className="text-sm font-normal text-stone-500">lệnh</span>
                </strong>
              </div>

              <div className="admin-kpi-card">
                <span className="kpi-label">Lệnh bị từ chối</span>
                <strong className="kpi-value">
                  {rejectedWithdrawals.length} <span className="text-sm font-normal text-stone-500">lệnh</span>
                </strong>
              </div>

              <div className="admin-kpi-card">
                <span className="kpi-label">Lệnh đã chi trả</span>
                <strong className="kpi-value">
                  {completedWithdrawals.length} <span className="text-sm font-normal text-stone-500">lệnh</span>
                </strong>
              </div>

              <div className="admin-kpi-card">
                <span className="kpi-label">Số tiền đã chi trả</span>
                <strong className="kpi-value text-green">
                  {formatVnd(completedWithdrawalsSum)}
                </strong>
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
                  placeholder="Tìm theo tên, email, STK, mã lệnh…"
                  aria-label="Tìm kiếm lệnh rút"
                  value={withdrawalSearch}
                  onChange={(e) => {
                    setWithdrawalSearch(e.target.value);
                    setWithdrawalPage(1);
                  }}
                  className="admin-search-input"
                />
                {withdrawalSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawalSearch("");
                      setWithdrawalPage(1);
                    }}
                    className="admin-search-clear"
                    title="Xóa tìm kiếm"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="admin-filters-row">
                <div className="filter-group">
                  <label htmlFor="admin-w-status">Trạng thái:</label>
                  <select
                    id="admin-w-status"
                    value={withdrawalFilter}
                    onChange={(e) => {
                      setWithdrawalFilter(e.target.value as any);
                      setWithdrawalPage(1);
                    }}
                    className="admin-select"
                  >
                    <option value="all">Tất cả ({allWithdrawals.length})</option>
                    <option value="pending">Chờ duyệt ({pendingWithdrawalsCount})</option>
                    <option value="completed">Đã chi trả ({completedWithdrawals.length})</option>
                    <option value="rejected">Từ chối ({rejectedWithdrawals.length})</option>
                  </select>
                </div>

                <div className="filter-group">
                  <label htmlFor="admin-w-sort">Sắp xếp:</label>
                  <select
                    id="admin-w-sort"
                    value={withdrawalSort}
                    onChange={(e) => {
                      setWithdrawalSort(e.target.value as any);
                      setWithdrawalPage(1);
                    }}
                    className="admin-select"
                  >
                    <option value="created_desc">Mới nhất</option>
                    <option value="amount_desc">Số tiền cao nhất</option>
                    <option value="amount_asc">Số tiền thấp nhất</option>
                    <option value="created_asc">Cũ nhất</option>
                  </select>
                </div>

                <div className="filter-count-badge">
                  <b>{filteredWithdrawals.length}</b> / {allWithdrawals.length} lệnh
                </div>
              </div>
            </section>

            {/* Table of Withdrawals */}
            <section className="admin-table-container">
              {loadingAllWithdrawals && allWithdrawals.length === 0 ? (
                <div className="admin-empty-state">
                  <ArrowClockwise size={28} className="animate-spin inline-block mb-3 text-orange-500" />
                  <p>Đang tải danh sách yêu cầu rút tiền...</p>
                </div>
              ) : filteredWithdrawals.length === 0 ? (
                <div className="admin-empty-state">
                  <div className="empty-icon"><MagnifyingGlass size={36} weight="duotone" className="text-stone-400 mx-auto" /></div>
                  <h3>Không tìm thấy yêu cầu rút tiền nào</h3>
                  {allWithdrawals.length === 0 && (
                    <p>Chưa có yêu cầu rút tiền nào trong hệ thống.</p>
                  )}
                  {(withdrawalFilter !== "all" || withdrawalSearch) && (
                    <button
                      type="button"
                      onClick={() => {
                        setWithdrawalSearch("");
                        setWithdrawalFilter("all");
                      }}
                      className="admin-btn-secondary"
                    >
                      Đặt lại bộ lọc
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="table-responsive">
                    <table className="admin-data-table" aria-label="Danh sách duyệt lệnh rút tiền">
                      <thead>
                        <tr>
                          <th scope="col">Thời gian</th>
                          <th scope="col">Thành viên</th>
                          <th scope="col" className={design.numeric}>Số tiền</th>
                          <th scope="col">Tài khoản nhận</th>
                          <th scope="col" className="text-center">Trạng thái</th>
                          <th scope="col" className="text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedWithdrawals.map((w) => {
                          const matchedUser = users.find((u) => u.id === w.userId || u.email.toLowerCase() === w.userEmail.toLowerCase());
                          const isApproving = approvingWithdrawalId === w.id;
                          return (
                            <tr key={w.id} className="admin-table-row">
                              {/* Cột 1: Thời gian & Mã */}
                              <td>
                                <div className="font-semibold text-stone-900 text-xs">
                                  {formatDate(w.createdAt)}
                                </div>
                                <div className="text-[11px] font-mono text-stone-400 mt-0.5">
                                  #{w.id.slice(0, 8)}
                                </div>
                              </td>

                              {/* Cột 2: Thành viên */}
                              <td className="cell-user">
                                <div className="user-profile-cell">
                                  <div className="user-avatar-wrap">
                                    {matchedUser?.avatarUrl ? (
                                      <img src={matchedUser.avatarUrl} alt={w.userName || w.userEmail} className="user-avatar-img" />
                                    ) : (
                                      <div className="user-avatar-fallback">{initials(w.userName || w.userEmail)}</div>
                                    )}
                                  </div>
                                  <div className="user-cell-texts">
                                    <span className="user-name-text">{w.userName || "Thành viên"}</span>
                                    <span className="user-email-text">{w.userEmail}</span>
                                  </div>
                                </div>
                              </td>

                              {/* Cột 3: Số tiền rút */}
                              <td className={design.numeric}>
                                <strong className="text-[#109452] text-sm font-bold">{formatVnd(w.amount)}</strong>
                              </td>

                              {/* Cột 4: Thông tin ngân hàng */}
                              <td className="cell-bank">
                                <div className="bank-cell-box">
                                  <div className="flex items-center gap-1.5 text-xs">
                                    <strong className="text-stone-900 font-semibold">{w.bankName}</strong>
                                    <span className="text-stone-300">·</span>
                                    <span className="text-[11px] font-medium text-stone-500 uppercase">{w.bankAccountName || w.userName}</span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="font-mono text-xs font-semibold text-stone-800 tracking-wide">{w.bankAccountNo}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopySTK(w.bankAccountNo, w.bankName)}
                                      className="btn-copy-stk"
                                      title="Sao chép số tài khoản"
                                    >
                                      {copiedSTK === w.bankAccountNo ? (
                                        <>
                                          <Check size={11} weight="bold" className="text-emerald-600" />
                                          <span className="text-emerald-700">Đã chép</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy size={11} />
                                          <span>Chép</span>
                                        </>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setQrWithdrawal({
                                          id: w.id,
                                          amount: w.amount,
                                          bankName: w.bankName,
                                          bankAccountNo: w.bankAccountNo,
                                          bankAccountName: w.bankAccountName || w.userName,
                                          refCode: matchedUser?.refCode || w.id.slice(0, 8),
                                        })
                                      }
                                      className="btn-qr-mini"
                                      title="Tạo mã VietQR kèm số tiền rút"
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
                                        <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
                                        <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
                                        <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
                                      </svg>
                                      <span>Mã QR</span>
                                    </button>
                                  </div>
                                </div>
                              </td>

                              {/* Cột 5: Trạng thái */}
                              <td className="text-center">
                                {w.status === "pending" && (
                                  <span className="w-badge w-pending">
                                    <Clock size={11} weight="bold" />
                                    <span>Chờ duyệt</span>
                                  </span>
                                )}
                                {w.status === "completed" && (
                                  <span className="w-badge w-completed">
                                    <CheckCircle size={11} weight="fill" />
                                    <span>Đã chi trả</span>
                                  </span>
                                )}
                                {w.status === "rejected" && (
                                  <span className="w-badge w-rejected">
                                    <XCircle size={11} weight="fill" />
                                    <span>Từ chối</span>
                                  </span>
                                )}
                              </td>

                              {/* Cột 6: Thao tác duyệt */}
                              <td className="cell-actions text-right">
                                {w.status === "pending" ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      disabled={isApproving}
                                      onClick={() => handleApproveWithdrawalDirect(w, "completed")}
                                      className="btn-approve-direct"
                                      title="Xác nhận đã chuyển tiền thành công"
                                    >
                                      {isApproving ? "Đang xử lý…" : (
                                        <>
                                          <Check size={13} weight="bold" />
                                          <span>Duyệt</span>
                                        </>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isApproving}
                                      onClick={() => handleApproveWithdrawalDirect(w, "rejected")}
                                      className="btn-reject-direct"
                                      title="Từ chối yêu cầu và hoàn tiền về ví"
                                    >
                                      <X size={13} weight="bold" />
                                      <span>Từ chối</span>
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-stone-300 select-none font-medium text-sm">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Bar for Withdrawals */}
                  <div className="admin-pagination-bar">
                    <div className="pagination-info">
                      <span>
                        Hiển thị <b>{filteredWithdrawals.length === 0 ? 0 : (safeWithdrawalPage - 1) * withdrawalPageSize + 1}–{Math.min(safeWithdrawalPage * withdrawalPageSize, filteredWithdrawals.length)}</b> / <b>{filteredWithdrawals.length}</b> lệnh
                      </span>
                      <div className="pagination-size-wrap">
                        <label htmlFor="w-page-size">Số dòng:</label>
                        <select
                          id="w-page-size"
                          value={withdrawalPageSize}
                          onChange={(e) => {
                            setWithdrawalPageSize(Number(e.target.value));
                            setWithdrawalPage(1);
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

                    {totalWithdrawalPages > 1 && (
                      <div className="pagination-controls">
                        <button
                          type="button"
                          onClick={() => setWithdrawalPage(1)}
                          disabled={safeWithdrawalPage === 1}
                          className="pagination-btn pagination-nav"
                          title="Trang đầu"
                        >
                          «
                        </button>
                        <button
                          type="button"
                          onClick={() => setWithdrawalPage((p) => Math.max(1, p - 1))}
                          disabled={safeWithdrawalPage === 1}
                          className="pagination-btn pagination-nav"
                          title="Trang trước"
                        >
                          ‹ Trước
                        </button>
                        <div className="pagination-pages">
                          {getPageNumbers(safeWithdrawalPage, totalWithdrawalPages).map((page, idx) =>
                            page === "..." ? (
                              <span key={`w-ellipsis-${idx}`} className="pagination-ellipsis">
                                …
                              </span>
                            ) : (
                              <button
                                key={`w-page-${page}`}
                                type="button"
                                onClick={() => setWithdrawalPage(Number(page))}
                                className={`pagination-btn pagination-num ${
                                  safeWithdrawalPage === page ? "active" : ""
                                }`}
                              >
                                {page}
                              </button>
                            )
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setWithdrawalPage((p) => Math.min(totalWithdrawalPages, p + 1))}
                          disabled={safeWithdrawalPage === totalWithdrawalPages}
                          className="pagination-btn pagination-nav"
                          title="Trang sau"
                        >
                          Sau ›
                        </button>
                        <button
                          type="button"
                          onClick={() => setWithdrawalPage(totalWithdrawalPages)}
                          disabled={safeWithdrawalPage === totalWithdrawalPages}
                          className="pagination-btn pagination-nav"
                          title="Trang cuối"
                        >
                          »
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="admin-settings-section">
            {/* Header & Actions chuẩn style titleBar của tab Người dùng */}
            <div className={design.titleBar}>
              <div>
                <h1>Cấu hình tỷ lệ hoàn tiền</h1>
              </div>
              <div className="admin-actions-area">
                <button
                  type="button"
                  className="admin-btn-primary"
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                >
                  {savingSettings ? (
                    <>
                      <ArrowClockwise size={18} className="animate-spin" />
                      <span>Đang lưu…</span>
                    </>
                  ) : (
                    <>
                      <FloppyDisk size={18} weight="bold" />
                      <span>Lưu thay đổi</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 2 Card thống kê cân đối chuẩn style admin-kpi-grid của tab Người dùng */}
            <section className="admin-kpi-grid settings-kpi-grid" aria-label="Cấu hình tỷ lệ hoàn tiền">
              {/* Cột 1: % Hoàn tiền cho khách */}
              <div className="admin-kpi-card">
                <span className="kpi-label">Tỷ lệ hoàn tiền cho khách</span>
                <div className="flex items-center gap-2 mt-1 h-[46px]">
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
                    className="kpi-value text-[#ee4c23] bg-stone-50 hover:bg-white focus:bg-white border border-[#dfe5ed] focus:border-[#ee4c23] rounded-lg px-3 w-32 h-[42px] outline-none transition-all text-left"
                  />
                  <span className="text-xl font-bold text-[#ee4c23]">%</span>
                </div>
              </div>

              {/* Cột 2: % Lợi nhuận DealHoàn giữ lại */}
              <div className="admin-kpi-card">
                <span className="kpi-label">Lợi nhuận DealHoàn giữ lại</span>
                <div className="flex items-center gap-2.5 mt-1 h-[46px]">
                  <strong className="kpi-value text-green">
                    {(100 - (boosterSettings.userCashbackPercent ?? 88.0)).toFixed(1)}%
                  </strong>
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                    Tự động tính
                  </span>
                </div>
              </div>
            </section>

            {/* Thanh hiển thị phân bổ tổng thể chuẩn style card trắng viền nhẹ */}
            <div className="bg-white border border-[#dfe5ed] rounded-xl p-6 mb-6">
              <div className="flex justify-between items-center text-xs font-semibold text-[#657084] mb-3">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ee4c23]"></span>
                  <span className="text-stone-700">Khách nhận:</span>
                  <strong className="text-[#ee4c23] text-sm">{(boosterSettings.userCashbackPercent ?? 88.0).toFixed(1)}%</strong>
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#109452]"></span>
                  <span className="text-stone-700">DealHoàn giữ:</span>
                  <strong className="text-[#109452] text-sm">{(100 - (boosterSettings.userCashbackPercent ?? 88.0)).toFixed(1)}%</strong>
                </span>
              </div>
              <div className="w-full h-3 bg-[#eef2f6] rounded-full overflow-hidden flex">
                <div
                  style={{ width: `${boosterSettings.userCashbackPercent ?? 88.0}%` }}
                  className="h-full bg-[#ee4c23] transition-all duration-300"
                ></div>
                <div
                  style={{ width: `${100 - (boosterSettings.userCashbackPercent ?? 88.0)}%` }}
                  className="h-full bg-[#109452] transition-all duration-300"
                ></div>
              </div>
            </div>
          </section>
        )}

        {(activeTab === "sync" || activeTab === "import") && (
          <section className="admin-import-container flex flex-col gap-5">
            {/* 1. THẺ NẠP ĐƠN HÀNG SHOPEE QUA CSV */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center shrink-0 shadow-xs">
                  <CloudArrowUp size={22} weight="bold" />
                </div>
                <h3 className="text-lg font-bold text-stone-900 m-0">
                  Nạp Đơn Hàng Shopee
                </h3>
              </div>

              <div className="flex items-center gap-3">
                <input
                  ref={csvFileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleCsvUpload}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => csvFileInputRef.current?.click()}
                  disabled={isUploadingCsv}
                  className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  {isUploadingCsv ? (
                    <>
                      <ArrowClockwise size={16} weight="bold" className="animate-spin" />
                      <span>Đang nạp file CSV...</span>
                    </>
                  ) : (
                    <>
                      <FileCsv size={18} weight="bold" />
                      <span>Import file Shopee</span>
                    </>
                  )}
                </button>
              </div>

              {csvUploadResult && (
                <div
                  className={`w-full p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 ${
                    csvUploadResult.success
                      ? "bg-emerald-50 text-emerald-900 border border-emerald-300"
                      : "bg-red-50 text-red-900 border border-red-300"
                  }`}
                >
                  {csvUploadResult.success ? (
                    <CheckCircle size={18} weight="fill" className="text-emerald-600 shrink-0" />
                  ) : (
                    <WarningCircle size={18} weight="fill" className="text-red-600 shrink-0" />
                  )}
                  <span>{csvUploadResult.message}</span>
                </div>
              )}
            </div>

            {/* 2. BẢNG ĐƠN HÀNG SHOPEE ĐÃ GHI NHẬN (TRUNG TÂM) */}
            <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-base font-bold text-stone-900 m-0 flex items-center gap-2">
                  <Receipt size={20} weight="bold" className="text-orange-600" />
                  <span>Danh Sách Đơn Hàng Shopee Đã Ghi Nhận ({filteredRecentSyncedOrders.length})</span>
                </h4>
                <button
                  type="button"
                  onClick={() => loadShopeeSyncConfig()}
                  className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5"
                >
                  <ArrowClockwise size={14} weight="bold" />
                  <span>Làm mới danh sách</span>
                </button>
              </div>

              {filteredRecentSyncedOrders.length === 0 ? (
                <div className="p-8 text-center bg-stone-50 rounded-xl border border-dashed border-stone-200 text-stone-500 text-sm">
                  <ShoppingCart size={40} weight="duotone" className="mx-auto mb-2 text-stone-400" />
                  <p className="font-bold text-stone-800">Chưa có đơn hàng nào được ghi nhận</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="admin-data-table" aria-label="Danh sách đơn hàng Shopee">
                    <thead>
                      <tr>
                        <th>Mã đơn Shopee</th>
                        <th>Thành viên</th>
                        <th className="text-right">Giá trị đơn</th>
                        <th className="text-right">Hoa hồng Shopee</th>
                        <th className="text-right">Tiền hoàn ({boosterSettings.userCashbackPercent ?? 88}%)</th>
                        <th className="text-center">Trạng thái</th>
                        <th className="text-right">Thời gian</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecentSyncedOrders.map((ord, idx) => {
                        const matchedUser = users.find((u) => ord.userId && u.id.startsWith(ord.userId));
                        return (
                          <tr key={idx} className="admin-table-row">
                            <td className="font-mono text-xs font-bold text-stone-900">{ord.orderId}</td>
                            <td>
                              {matchedUser ? (
                                <div className="font-bold text-emerald-800 text-xs">
                                  {matchedUser.fullName || matchedUser.email}
                                </div>
                              ) : (
                                <span className="text-xs font-mono font-bold text-orange-700">{ord.subId}</span>
                              )}
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
                <X size={18} weight="bold" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="admin-modal-body">
              {/* Section 1: Thống kê ví của User */}
              <div className="modal-section-grid">
                <div className="modal-stat-box gray-box">
                  <span className="box-label">CHỜ NỀN TẢNG DUYỆT</span>
                  <span className="box-val gray-text">{formatVnd(selectedUser.pendingBalance)}</span>
                </div>
                <div className="modal-stat-box green-box">
                  <span className="box-label">CÓ THỂ RÚT</span>
                  <span className="box-val green-text">{formatVnd(selectedUser.balance)}</span>
                </div>
              </div>

              {/* Section 2: Thông tin ngân hàng & QR Napas */}
              <div className="modal-card-block">
                <div className="block-title-row">
                  <div className="flex items-center gap-2">
                    <Bank size={20} weight="bold" className="text-orange-600" />
                    <h4 className="block-title">Tài Khoản Ngân Hàng</h4>
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
                      className="btn-copy-all flex items-center gap-1"
                    >
                      <Copy size={13} weight="bold" />
                      <span>Copy đầy đủ</span>
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
                            className="btn-copy-mini flex items-center gap-1"
                          >
                            {copiedId === "modal-stk" ? (
                              <>
                                <Check size={12} weight="bold" />
                                <span>Đã chép</span>
                              </>
                            ) : (
                              <span>Sao chép</span>
                            )}
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://img.vietqr.io/image/${getVietQrBankCode(
                          selectedUser.bankName
                        )}-${selectedUser.bankAccountNo}-compact2.png?addInfo=DealHoan%20${selectedUser.refCode}`}
                        alt="Mã VietQR"
                        className="vietqr-img"
                        loading="lazy"
                      />
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
                    <GearSix size={20} weight="bold" className="text-orange-600" />
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
                      <label>Lý do:</label>
                      <input
                        type="text"
                        placeholder="Lý do điều chỉnh"
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
                        {isUpdatingUser ? "Đang lưu..." : "Lưu thay đổi"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: Đơn Hàng Hoàn Tiền */}
              <div className="modal-card-block">
                <div
                  className={`block-title-row cursor-pointer select-none ${showOrdersDropdown ? "" : "mb-0"}`}
                  onClick={() => setShowOrdersDropdown(!showOrdersDropdown)}
                >
                  <div className="flex items-center gap-2">
                    <ShoppingBag size={20} weight="bold" className="text-orange-600" />
                    <h4 className="block-title">
                      Đơn Hàng Hoàn Tiền ({filteredUserOrders.length})
                    </h4>
                  </div>
                  <button
                    type="button"
                    className="text-stone-400 hover:text-stone-700 transition-transform duration-200"
                    style={{ transform: showOrdersDropdown ? "rotate(180deg)" : "rotate(0deg)" }}
                    aria-label={showOrdersDropdown ? "Đóng dropdown" : "Mở dropdown"}
                  >
                    <CaretDown size={18} weight="bold" />
                  </button>
                </div>

                {showOrdersDropdown && (
                  loadingOrders ? (
                    <div className="p-4 text-center text-stone-500 text-sm">Đang tải danh sách đơn hàng...</div>
                  ) : filteredUserOrders.length === 0 ? (
                    <div className="p-4 text-center text-stone-500 text-sm">
                      Không có thông tin
                    </div>
                  ) : (
                    <div className="modal-withdrawals-list">
                      {filteredUserOrders.map((ord) => (
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
                              <span className="w-badge w-completed inline-flex items-center gap-1">
                                <CheckCircle size={11} weight="fill" />
                                <span>Đã hoàn ví</span>
                              </span>
                            )}
                            {ord.status === "rejected" && (
                              <span className="w-badge w-rejected inline-flex items-center gap-1">
                                <XCircle size={11} weight="fill" />
                                <span>Bị hủy</span>
                              </span>
                            )}
                            {ord.status === "pending" && (
                              <span className="w-badge w-pending inline-flex items-center gap-1">
                                <Clock size={11} weight="bold" />
                                <span>Chờ duyệt</span>
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>

              {/* Section 5: Lịch sử các lệnh rút tiền */}
              <div className="modal-card-block">
                <div
                  className={`block-title-row cursor-pointer select-none ${showWithdrawalsDropdown ? "" : "mb-0"}`}
                  onClick={() => setShowWithdrawalsDropdown(!showWithdrawalsDropdown)}
                >
                  <div className="flex items-center gap-2">
                    <Receipt size={20} weight="bold" className="text-orange-600" />
                    <h4 className="block-title">
                      Lịch Sử Yêu Cầu Rút Tiền ({userWithdrawals.length})
                    </h4>
                  </div>
                  <button
                    type="button"
                    className="text-stone-400 hover:text-stone-700 transition-transform duration-200"
                    style={{ transform: showWithdrawalsDropdown ? "rotate(180deg)" : "rotate(0deg)" }}
                    aria-label={showWithdrawalsDropdown ? "Đóng dropdown" : "Mở dropdown"}
                  >
                    <CaretDown size={18} weight="bold" />
                  </button>
                </div>

                {showWithdrawalsDropdown && (
                  loadingWithdrawals ? (
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
                            {w.bank_account_no && (
                              <button
                                type="button"
                                onClick={() =>
                                  setQrWithdrawal({
                                    id: w.id,
                                    amount: w.amount,
                                    bankName: w.bank_name,
                                    bankAccountNo: w.bank_account_no,
                                    bankAccountName: w.bank_account_name,
                                    refCode: selectedUser?.refCode || w.id.slice(0, 8),
                                  })
                                }
                                className="btn-qr-mini mt-1.5"
                                title="Tạo mã VietQR kèm số tiền rút"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
                                  <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
                                  <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
                                  <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
                                </svg>
                                <span>Mã VietQR ({formatVnd(w.amount)})</span>
                              </button>
                            )}
                          </div>
                          <div className="w-item-right">
                            {w.status === "completed" && (
                              <span className="w-badge w-completed inline-flex items-center gap-1">
                                <CheckCircle size={11} weight="fill" />
                                <span>Đã chuyển</span>
                              </span>
                            )}
                            {w.status === "rejected" && (
                              <span className="w-badge w-rejected inline-flex items-center gap-1">
                                <XCircle size={11} weight="fill" />
                                <span>Bị từ chối</span>
                              </span>
                            )}
                            {w.status === "pending" && (
                              <div className="pending-actions-wrap">
                                <span className="w-badge w-pending inline-flex items-center gap-1">
                                  <Clock size={11} weight="bold" />
                                  <span>Chờ xử lý</span>
                                </span>
                                <div className="flex gap-1 mt-2">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateWithdrawalStatus(w.id, "completed")}
                                    className="btn-approve-mini flex items-center gap-1"
                                    title="Xác nhận đã chuyển tiền thành công"
                                  >
                                    <Check size={12} weight="bold" />
                                    <span>Duyệt</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateWithdrawalStatus(w.id, "rejected")}
                                    className="btn-reject-mini flex items-center gap-1"
                                    title="Từ chối lệnh rút tiền này"
                                  >
                                    <X size={12} weight="bold" />
                                    <span>Từ chối</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
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

      {/* Modal VietQR cho Lệnh Rút Tiền Kèm Số Tiền Muốn Rút */}
      {qrWithdrawal && (
        <div className="admin-modal-backdrop" onClick={() => setQrWithdrawal(null)}>
          <div
            className="admin-modal-dialog"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div>
                <h3 className="modal-user-name">Mã VietQR Rút Tiền</h3>
                <p className="modal-user-email">
                  Số tiền cần chuyển: <b className="text-emerald-700 text-sm">{formatVnd(qrWithdrawal.amount)}</b>
                </p>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setQrWithdrawal(null)}
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="admin-modal-body text-center p-4">
              <div className="vietqr-box mx-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://img.vietqr.io/image/${getVietQrBankCode(
                    qrWithdrawal.bankName
                  )}-${qrWithdrawal.bankAccountNo}-compact2.png?amount=${
                    qrWithdrawal.amount
                  }&addInfo=DealHoan%20rut%20tien%20${encodeURIComponent(qrWithdrawal.refCode || qrWithdrawal.id.slice(0, 8))}`}
                  alt={`Mã VietQR ${qrWithdrawal.amount}`}
                  className="vietqr-img"
                  loading="lazy"
                />
              </div>

              <div className="mt-3 text-xs text-stone-600 space-y-1.5 bg-stone-50 p-3 rounded-xl border border-stone-200 text-left">
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">Ngân hàng:</span>
                  <span className="font-semibold text-stone-800">{qrWithdrawal.bankName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">Số tài khoản:</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-stone-900">{qrWithdrawal.bankAccountNo}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(qrWithdrawal.bankAccountNo, "Số tài khoản")}
                      className="text-orange-600 font-semibold text-[11px] hover:underline"
                    >
                      Sao chép
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">Chủ tài khoản:</span>
                  <span className="font-semibold text-stone-800 uppercase">{qrWithdrawal.bankAccountName}</span>
                </div>
                <div className="flex justify-between items-center border-t border-stone-200 pt-1.5 mt-1">
                  <span className="text-stone-500">Số tiền:</span>
                  <span className="font-black text-emerald-700 text-sm">{formatVnd(qrWithdrawal.amount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-500">Nội dung:</span>
                  <span className="font-mono text-stone-700">DealHoan rut tien {qrWithdrawal.refCode || qrWithdrawal.id.slice(0, 8)}</span>
                </div>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button
                type="button"
                onClick={() => setQrWithdrawal(null)}
                className="admin-btn-secondary"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
