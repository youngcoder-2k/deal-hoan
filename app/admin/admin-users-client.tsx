"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import type { AdminUserItem, AdminKPIStats } from "@/lib/auth/admin";
import {
  type CashbackBoosterSettings,
  DEFAULT_BOOSTER_SETTINGS,
} from "@/lib/deals/cashback-booster-types";
import {
  parseShopeeConversionReport,
  SAMPLE_SHOPEE_CSV,
  type ParseReportResult,
  type ParsedShopeeOrder,
} from "@/lib/deals/shopee-import";

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
        return {
          ...u,
          balance: ov.balance,
          pendingBalance: ov.pendingBalance,
          totalEarned: ov.balance + u.totalWithdrawn,
        };
      }
      return u;
    });
  } catch {
    return usersList;
  }
}

const SIMULATION_ITEMS = [
  { name: "📱 iPhone 16 Pro Max 256GB", category: "Điện thoại Flagship", price: 34990000, hnRate: 1.8 },
  { name: "💻 Laptop ASUS ROG Gaming", category: "Laptop / Công nghệ", price: 22500000, hnRate: 2.5 },
  { name: "🫖 Bình đun siêu tốc Lock&Lock", category: "Gia dụng đời sống", price: 420000, hnRate: 3.8 },
  { name: "🎧 Tai nghe Sony WF-C710N", category: "Âm thanh Mall", price: 1540000, hnRate: 5.0 },
  { name: "🍼 Sữa bột Meiji cho bé", category: "Mẹ & Bé / Tiêu dùng", price: 520000, hnRate: 6.2 },
  { name: "👕 Áo thun nam nữ PTLuxury", category: "Thời trang", price: 120000, hnRate: 8.0 },
  { name: "💄 Son môi lì Black Rouge", category: "Mỹ phẩm làm đẹp", price: 180000, hnRate: 9.5 },
];

function calcSimResult(hnRate: number, price: number, settings: CashbackBoosterSettings) {
  if (settings.boostFactor <= 0) {
    const cash = Math.round(price * (hnRate / 100));
    const shopeeEst = hnRate * 1.333;
    const margin = ((shopeeEst - hnRate) / shopeeEst) * 100;
    return {
      bonus: 0,
      finalRate: hnRate,
      cashbackAmount: cash,
      shopeeEst,
      margin: Math.max(0, margin),
    };
  }

  const maxB = settings.maxBonusRate * settings.boostFactor;
  const minB = settings.minBonusRate * settings.boostFactor;
  const scale = (maxB - minB) / 0.7;
  const rawNorm = 1.0 - 0.0165 * Math.pow(Math.max(0, 8.0 - hnRate), 2);
  const targetBonus = Math.max(minB, Math.min(maxB, minB + (rawNorm - 0.3) * scale));

  const maxSafeBonus = Number((hnRate * 0.20 * Math.min(1.0, settings.boostFactor)).toFixed(2));
  const floorBonus = Math.min(targetBonus, minB);
  const effectiveBonus = Math.min(targetBonus, Math.max(floorBonus, maxSafeBonus));

  const finalRate = Number((hnRate + effectiveBonus).toFixed(1));
  const actualBonus = Number((finalRate - hnRate).toFixed(1));
  const cash = Math.round(price * (finalRate / 100));
  const shopeeEst = hnRate * 1.333;
  const margin = ((shopeeEst - finalRate) / shopeeEst) * 100;

  return {
    bonus: actualBonus,
    finalRate,
    cashbackAmount: cash,
    shopeeEst,
    margin: Math.max(0, margin),
  };
}

export default function AdminUsersClient({
  initialUsers,
  initialStats,
  isInitialRealData,
}: {
  initialUsers: AdminUserItem[];
  initialStats: AdminKPIStats;
  isInitialRealData: boolean;
}) {
  const [users, setUsers] = useState<AdminUserItem[]>(() => applyLocalBalanceOverrides(initialUsers));
  const [stats, setStats] = useState<AdminKPIStats>(initialStats);
  const [isRealData, setIsRealData] = useState<boolean>(isInitialRealData);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Tab điều hướng: "users" (Quản lý User), "settings" (Cấu hình % Hoàn tiền), "import" (Nhập Báo Cáo Shopee)
  const [activeTab, setActiveTab] = useState<"users" | "settings" | "import">("users");
  const [boosterSettings, setBoosterSettings] = useState<CashbackBoosterSettings>(DEFAULT_BOOSTER_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // State quản lý Nhập báo cáo Shopee tự động
  const [importCsvText, setImportCsvText] = useState<string>("");
  const [importFileName, setImportFileName] = useState<string>("");
  const [parsedReport, setParsedReport] = useState<ParseReportResult | null>(null);
  const [isProcessingImport, setIsProcessingImport] = useState<boolean>(false);
  const [importResultSummary, setImportResultSummary] = useState<{
    success: boolean;
    message: string;
    details?: {
      totalProcessed: number;
      successCount: number;
      failedCount: number;
      matchedUsersCount: number;
      totalCommission: number;
      totalCashback: number;
      netProfitMargin: number;
    };
  } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // State tự động đồng bộ qua Cookie Shopee
  const [shopeeCookie, setShopeeCookie] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dealhoan_shopee_cookie") || "";
    }
    return "";
  });
  const [isSyncingShopee, setIsSyncingShopee] = useState(false);
  const [shopeeSyncResult, setShopeeSyncResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);

  const loadShopeeSyncConfig = async () => {
    try {
      const res = await fetch("/api/admin/shopee/sync");
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          if (data.config.shopeeCookie && !shopeeCookie) {
            setShopeeCookie(data.config.shopeeCookie);
          }
          setAutoSyncEnabled(data.config.autoSyncEnabled ?? true);
          setLastSyncAt(data.config.lastSyncAt || null);
          setLastSyncResult(data.config.lastSyncResult || null);
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: shopeeCookie.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShopeeSyncResult({ success: true, message: data.message });
        setLastSyncAt(new Date().toISOString());
        setLastSyncResult(data.message);
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

  // Tự động chạy ngầm định kỳ 15 phút mà không cần ai bấm nút
  useEffect(() => {
    loadShopeeSyncConfig();
    const interval = setInterval(() => {
      if (autoSyncEnabled && shopeeCookie) {
        handleSyncShopee(true);
      }
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoSyncEnabled, shopeeCookie]);

  const handleParseCsv = (content: string, filename?: string) => {
    setImportCsvText(content);
    if (filename) setImportFileName(filename);
    setImportResultSummary(null);
    try {
      const result = parseShopeeConversionReport(content, {
        safetyMarginPercent: boosterSettings.safetyMarginPercent,
      });
      setParsedReport(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi phân tích";
      alert("Lỗi phân tích file CSV: " + msg);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text === "string") {
        handleParseCsv(text, file.name);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text === "string") {
        handleParseCsv(text, file.name);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleUseDemoCsv = () => {
    handleParseCsv(SAMPLE_SHOPEE_CSV, "shopee_conversion_report_demo.csv");
  };

  const handleExecuteImport = async () => {
    if (!parsedReport || parsedReport.validOrders.length === 0) {
      alert("Không có đơn hàng hợp lệ nào khớp với thành viên để nạp tiền.");
      return;
    }

    setIsProcessingImport(true);
    setImportResultSummary(null);
    try {
      const res = await fetch("/api/admin/orders/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders: parsedReport.validOrders,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setImportResultSummary({
          success: true,
          message: data.message,
          details: data.summary,
        });
        setToastMsg("🎉 " + data.message);
        setTimeout(() => setToastMsg(null), 4000);
        await reloadUsers();
      } else {
        setImportResultSummary({
          success: false,
          message: data.error || "Có lỗi xảy ra khi nạp đơn vào ví.",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi kết nối";
      setImportResultSummary({
        success: false,
        message: msg,
      });
    } finally {
      setIsProcessingImport(false);
    }
  };

  // Tải cấu hình tỷ lệ hoàn tiền
  const loadBoosterSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
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
        headers: { "Content-Type": "application/json" },
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
      const res = await fetch("/api/admin/users");
      if (res.status === 403) {
        window.location.href = "/admin";
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
        const res = await fetch("/api/admin/users");
        if (res.status === 403) {
          window.location.href = "/admin";
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
    return () => {
      isMounted = false;
    };
  }, []);

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
      const res = await fetch(`/api/admin/users/${user.id}/withdrawals`);
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
      const oRes = await fetch(`/api/admin/orders?userId=${user.id}`);
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
        headers: { "Content-Type": "application/json" },
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
            : "❌ Đã từ chối lệnh rút"
        );
        setUserWithdrawals((prev) =>
          prev.map((w) =>
            w.id === withdrawalId ? { ...w, status: newStatus, note: promptNote } : w
          )
        );
        refreshData();
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
    <div className="admin-page-container">
      {/* Toast Notification */}
      {toastMsg && <div className="admin-toast">{toastMsg}</div>}

      {/* Top Header */}
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-brand-area">
            <Link href="/" className="admin-back-btn" title="Quay lại trang chủ DealHoàn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              <span>Về trang chủ</span>
            </Link>

            <div className="admin-title-wrap">
              <div className="admin-title-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/deal-hoan-mark.png" alt="DealHoàn" className="admin-logo-mark" />
                <h1 className="admin-heading">Quản Lý Người Dùng & Số Dư</h1>
                <span className="admin-role-tag">🛡️ Admin Portal</span>
                {isRealData ? (
                  <span
                    className="admin-status-badge badge-live"
                    title="Đang hiển thị dữ liệu tài khoản người dùng thực từ Supabase"
                  >
                    <span className="live-dot" /> Dữ liệu thật
                  </span>
                ) : (
                  <span
                    className="admin-status-badge badge-demo"
                    title="Chưa có người dùng thực trong CSDL, đang hiển thị dữ liệu mẫu"
                  >
                    Demo Mode
                  </span>
                )}
              </div>
              <p className="admin-subheading">
                Tra cứu danh sách thành viên, số dư ví khả dụng, tài khoản ngân hàng nhận tiền và đối soát chi trả.
              </p>
            </div>
          </div>

          <div className="admin-actions-area">
            <button
              onClick={refreshData}
              disabled={loading}
              className="admin-btn-secondary"
              title="Tải lại dữ liệu"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={loading ? "animate-spin" : ""}
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{loading ? "Đang tải…" : "Làm mới"}</span>
            </button>

            <button
              onClick={exportToCsv}
              className="admin-btn-primary"
              title="Xuất file CSV danh sách người dùng và STK"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Xuất CSV ({filteredUsers.length})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs Bar */}
      <div className="admin-nav-tabs-bar">
        <button
          type="button"
          className={`admin-nav-tab-btn ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          <span className="tab-icon">👥</span>
          <span>Quản Lý Người Dùng & Số Dư</span>
          <span className="tab-pill">{users.length}</span>
        </button>
        <button
          type="button"
          className={`admin-nav-tab-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("settings");
            loadBoosterSettings();
          }}
        >
          <span className="tab-icon">⚙️</span>
          <span>Cấu Hình Tỷ Lệ Hoàn Tiền (Smart Booster)</span>
          <span className="tab-pill tab-pill-boost">
            {boosterSettings.boostFactor > 0 ? `${boosterSettings.boostFactor.toFixed(2)}x Boost` : "Tắt thưởng"}
          </span>
        </button>
        <button
          type="button"
          className={`admin-nav-tab-btn ${activeTab === "import" ? "active" : ""}`}
          onClick={() => setActiveTab("import")}
        >
          <span className="tab-icon">📥</span>
          <span>Nhập Báo Cáo Shopee (Tự Động Nạp Tiền)</span>
          <span className="tab-pill">
            {parsedReport ? `${parsedReport.validOrders.length} đơn` : "Auto"}
          </span>
        </button>
      </div>

      <main className="admin-main">
        {activeTab === "users" && (
          <>
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

        {/* KPI Stats Grid (5 Cards) */}
        <section className="admin-kpi-grid">
          {/* Card 1: Tổng người dùng */}
          <div className="admin-kpi-card">
            <div className="kpi-icon-wrap kpi-purple">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-label">TỔNG NGƯỜI DÙNG</span>
              <div className="kpi-value">{stats.totalUsers} <span className="kpi-unit">user</span></div>
              <div className="kpi-sub">Đã đăng ký tài khoản</div>
            </div>
          </div>

          {/* Card 2: Tổng số dư khả dụng */}
          <div className="admin-kpi-card">
            <div className="kpi-icon-wrap kpi-green">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-label">SỐ DƯ KHẢ DỤNG TOÀN SÀN</span>
              <div className="kpi-value text-green">{formatVnd(stats.totalBalance)}</div>
              <div className="kpi-sub">Cần chi trả khi user rút</div>
            </div>
          </div>

          {/* Card 3: Chờ đối soát */}
          <div className="admin-kpi-card">
            <div className="kpi-icon-wrap kpi-amber">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-label">TIỀN CHỜ HOÀN (14–15 NGÀY)</span>
              <div className="kpi-value text-amber">{formatVnd(stats.totalPendingBalance)}</div>
              <div className="kpi-sub">Đang đối soát đơn sàn</div>
            </div>
          </div>

          {/* Card 4: Tổng đã chi trả */}
          <div className="admin-kpi-card">
            <div className="kpi-icon-wrap kpi-blue">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 2 2 7h20L12 2z" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-label">TỔNG TIỀN ĐÃ CHI TRẢ</span>
              <div className="kpi-value text-blue">{formatVnd(stats.totalWithdrawn)}</div>
              <div className="kpi-sub">Đã chuyển khoản Napas247</div>
            </div>
          </div>

          {/* Card 5: Tỷ lệ liên kết ngân hàng */}
          <div className="admin-kpi-card">
            <div className="kpi-icon-wrap kpi-teal">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="14" x="2" y="5" rx="2" />
                <line x1="2" x2="22" y1="10" y2="10" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-label">LIÊN KẾT NGÂN HÀNG</span>
              <div className="kpi-value">
                {stats.bankLinkedUsers}/{stats.totalUsers}{" "}
                <span className="kpi-rate-badge">{stats.bankLinkedRate}%</span>
              </div>
              <div className="kpi-sub">Đã lưu thông tin tài khoản</div>
            </div>
          </div>
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
              placeholder="Tìm theo Tên, Email, Mã user, Số tài khoản, Ngân hàng..."
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
              <label>Tài khoản ngân hàng:</label>
              <select
                value={bankFilter}
                onChange={(e) =>
                  setBankFilter(e.target.value as "all" | "linked" | "unlinked")
                }
                className="admin-select"
              >
                <option value="all">Tất cả ({users.length})</option>
                <option value="linked">Đã có tài khoản NH ({users.filter((u) => u.isBankConfigured).length})</option>
                <option value="unlinked">Chưa liên kết ({users.filter((u) => !u.isBankConfigured).length})</option>
              </select>
            </div>

            {/* Lọc số dư */}
            <div className="filter-group">
              <label>Trạng thái số dư:</label>
              <select
                value={balanceFilter}
                onChange={(e) =>
                  setBalanceFilter(e.target.value as "all" | "positive" | "zero" | "pending")
                }
                className="admin-select"
              >
                <option value="all">Tất cả số dư</option>
                <option value="positive">Có số dư &gt; 0đ ({users.filter((u) => u.balance > 0).length})</option>
                <option value="pending">Có tiền chờ hoàn ({users.filter((u) => u.pendingBalance > 0).length})</option>
                <option value="zero">Số dư = 0đ ({users.filter((u) => u.balance === 0).length})</option>
              </select>
            </div>

            {/* Sắp xếp */}
            <div className="filter-group">
              <label>Sắp xếp theo:</label>
              <select
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
                <option value="smart_desc">✨ Mới nhất & Số dư lớn nhất (Mặc định)</option>
                <option value="created_desc">Mới tham gia nhất (Mới nhất) ↓</option>
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
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>NGƯỜI DÙNG</th>
                    <th>SỐ DƯ VÍ (VNĐ)</th>
                    <th>THÔNG TIN NGÂN HÀNG</th>
                    <th>LỆNH RÚT GẦN NHẤT</th>
                    <th className="text-right">THAO TÁC</th>
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

                      {/* Cột 2: Số dư */}
                      <td className="cell-balances">
                        <div className="balances-cell-wrap">
                          <div className="balance-pill green-pill" title="Số dư khả dụng có thể rút ngay">
                            <span className="pill-dot green-dot" />
                            <span className="pill-label">Khả dụng:</span>
                            <strong className="pill-val">{formatVnd(u.balance)}</strong>
                          </div>

                          <div className="balance-sub-row">
                            <span className="balance-sub-item amber-text" title="Tiền chờ duyệt đối soát">
                              ⏳ Chờ hoàn: <b>{formatVnd(u.pendingBalance)}</b>
                            </span>
                            <span className="balance-sub-item blue-text" title="Tổng tiền đã chi trả về tài khoản">
                              🏦 Đã rút: <b>{formatVnd(u.totalWithdrawn)}</b>
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Cột 3: Ngân hàng */}
                      <td className="cell-bank">
                        {u.isBankConfigured ? (
                          <div className="bank-info-box">
                            <div className="bank-badge-line">
                              <span className="bank-name-badge">{u.bankName}</span>
                            </div>

                            <div className="bank-account-line">
                              <span className="bank-no-mono">{u.bankAccountNo}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  copyToClipboard(u.bankAccountNo, "Số tài khoản", `stk-${u.id}`)
                                }
                                className={`btn-copy-mini ${
                                  copiedId === `stk-${u.id}` ? "copied" : ""
                                }`}
                                title="Sao chép số tài khoản"
                              >
                                {copiedId === `stk-${u.id}` ? (
                                  <span>✓ Đã chép</span>
                                ) : (
                                  <>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                    </svg>
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <div className="bank-holder-line">{u.bankAccountName}</div>
                          </div>
                        ) : (
                          <div className="bank-unlinked-badge">
                            <span>⚠️</span>
                            <span>Chưa liên kết ngân hàng</span>
                          </div>
                        )}
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
                            <span className="w-time">{formatDateShort(u.latestWithdrawal.createdAt)}</span>
                          </div>
                        ) : (
                          <span className="w-empty">— Chưa có lệnh —</span>
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
                            Chi tiết
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

        {activeTab === "settings" && (
          <section className="admin-settings-container">
            {/* Card 1: Bảng Điều Khiển Cấu Hình */}
            <div className="admin-settings-card">
              <div className="admin-settings-header">
                <div>
                  <h3>⚙️ Cấu Hình Tỷ Lệ Hoàn Tiền (Smart Cashback Booster)</h3>
                  <p>
                    Điều chỉnh mức hoàn tiền ưu đãi cạnh tranh của DealHoàn so với thị trường (Hoàn Ngay).
                    Thuật toán Parabol đảm bảo luôn cao hơn đối thủ nhưng kiểm soát an toàn để DealHoàn luôn có lãi ròng.
                  </p>
                </div>
                <div className="admin-security-badge">
                  🔒 Quyền Quản trị viên
                </div>
              </div>

              {/* Box 1: Hệ số Boost Factor Slider */}
              <div className="settings-section-box">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <label className="text-sm font-bold text-stone-800">
                    Hệ số Kích cầu (Boost Factor):
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black text-orange-600 bg-orange-50 border border-orange-200 px-3 py-1 rounded-xl">
                      {boosterSettings.boostFactor.toFixed(2)}x
                    </span>
                    <span className="text-xs text-stone-500 font-medium">
                      ({boosterSettings.boostFactor === 0 ? "Đang tắt thưởng thêm" : boosterSettings.boostFactor >= 1.0 ? "Thưởng tối đa" : `Thưởng ${Math.round(boosterSettings.boostFactor * 100)}%`})
                    </span>
                  </div>
                </div>

                <input
                  type="range"
                  min="0"
                  max="1.2"
                  step="0.05"
                  value={boosterSettings.boostFactor}
                  onChange={(e) =>
                    setBoosterSettings((prev) => ({
                      ...prev,
                      boostFactor: parseFloat(e.target.value),
                    }))
                  }
                  className="w-full accent-orange-600 cursor-pointer h-2 bg-stone-200 rounded-lg"
                />

                <div className="flex justify-between text-xs text-stone-500 mt-2 mb-4">
                  <span>0.0x (Tắt thưởng - Tối đa lợi nhuận)</span>
                  <span>0.6x (Giảm dần - Cân bằng)</span>
                  <span>1.0x (Kích cầu tối đa)</span>
                  <span>1.2x (Siêu ưu đãi)</span>
                </div>

                {/* 3 Preset Gợi Ý Theo Giai Đoạn Kinh Doanh */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-stone-200/80">
                  <button
                    type="button"
                    onClick={() =>
                      setBoosterSettings((prev) => ({
                        ...prev,
                        boostFactor: 1.0,
                        maxBonusRate: 1.0,
                        minBonusRate: 0.3,
                        safetyMarginPercent: 12.0,
                      }))
                    }
                    className={`preset-stage-btn ${boosterSettings.boostFactor === 1.0 ? "active" : ""}`}
                  >
                    <div className="preset-title">🚀 Giai đoạn 1: Kích cầu tối đa (1.0x)</div>
                    <div className="preset-desc">
                      DealHoàn hoàn cao hơn (+0.4% → +1.0%). Lãi giữ lại 12% – 15%. Dùng khi cần hút user từ Hoàn Ngay.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setBoosterSettings((prev) => ({
                        ...prev,
                        boostFactor: 0.6,
                        maxBonusRate: 0.6,
                        minBonusRate: 0.2,
                        safetyMarginPercent: 18.0,
                      }))
                    }
                    className={`preset-stage-btn ${boosterSettings.boostFactor === 0.6 ? "active" : ""}`}
                  >
                    <div className="preset-title">⚖️ Giai đoạn 2: Giảm dần tối ưu (0.6x)</div>
                    <div className="preset-desc">
                      Thưởng nhẹ (+0.2% → +0.6%). Lãi giữ lại tăng lên 18% – 22%. Dùng khi đã có lượng user ổn định.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setBoosterSettings((prev) => ({
                        ...prev,
                        boostFactor: 0.0,
                        maxBonusRate: 0.0,
                        minBonusRate: 0.0,
                        safetyMarginPercent: 25.0,
                      }))
                    }
                    className={`preset-stage-btn ${boosterSettings.boostFactor === 0.0 ? "active" : ""}`}
                  >
                    <div className="preset-title">💰 Giai đoạn 3: Bão hòa tối đa lãi (0.0x)</div>
                    <div className="preset-desc">
                      Tắt thưởng thêm, hoàn theo mức thị trường. DealHoàn giữ lại 25% – 30% hoa hồng sàn.
                    </div>
                  </button>
                </div>
              </div>

              {/* Box 2: Thông số Nâng Cao */}
              <div className="settings-advanced-grid">
                <div className="setting-field-card">
                  <div className="field-label">
                    <span>Mức thưởng tối đa (Max Bonus):</span>
                    <small>Áp dụng cho ngành hoa hồng cao (thời trang, mỹ phẩm)</small>
                  </div>
                  <div className="input-unit-wrap">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="3.0"
                      value={boosterSettings.maxBonusRate}
                      onChange={(e) =>
                        setBoosterSettings((prev) => ({
                          ...prev,
                          maxBonusRate: Math.max(0.1, parseFloat(e.target.value) || 0.1),
                        }))
                      }
                      className="admin-field-input"
                    />
                    <span className="unit">%</span>
                  </div>
                </div>

                <div className="setting-field-card">
                  <div className="field-label">
                    <span>Mức thưởng tối thiểu (Min Bonus):</span>
                    <small>Áp dụng cho ngành đồ điện tử / iPhone / laptop</small>
                  </div>
                  <div className="input-unit-wrap">
                    <input
                      type="number"
                      step="0.05"
                      min="0.0"
                      max="1.0"
                      value={boosterSettings.minBonusRate}
                      onChange={(e) =>
                        setBoosterSettings((prev) => ({
                          ...prev,
                          minBonusRate: Math.max(0, parseFloat(e.target.value) || 0),
                        }))
                      }
                      className="admin-field-input"
                    />
                    <span className="unit">%</span>
                  </div>
                </div>

                <div className="setting-field-card">
                  <div className="field-label">
                    <span>Biên lợi nhuận giữ lại tối thiểu:</span>
                    <small>DealHoàn luôn giữ lại % hoa hồng sàn để đảm bảo không bù lỗ</small>
                  </div>
                  <div className="input-unit-wrap">
                    <input
                      type="number"
                      step="1"
                      min="5"
                      max="40"
                      value={boosterSettings.safetyMarginPercent}
                      onChange={(e) =>
                        setBoosterSettings((prev) => ({
                          ...prev,
                          safetyMarginPercent: Math.max(5, parseFloat(e.target.value) || 5),
                        }))
                      }
                      className="admin-field-input"
                    />
                    <span className="unit">%</span>
                  </div>
                </div>
              </div>

              {/* Box 3: Tự động hạ dần theo User */}
              <div className="settings-toggle-box">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={boosterSettings.autoScaleWithUsers}
                    onChange={(e) =>
                      setBoosterSettings((prev) => ({
                        ...prev,
                        autoScaleWithUsers: e.target.checked,
                      }))
                    }
                    className="w-5 h-5 accent-orange-600 rounded cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-stone-800 text-sm">
                      Tự động hạ dần mức thưởng theo số lượng người dùng (Auto-scale by User Count)
                    </span>
                    <p className="text-xs text-stone-500 m-0">
                      Khi hệ thống đạt trên 5.000 user, hệ thống sẽ tự động điều chỉnh hệ số boost giảm dần để tối ưu hóa biên lợi nhuận.
                    </p>
                  </div>
                </label>
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
                    Bảng tính tự động áp dụng thông số trên để bạn nhìn thấy ngay % khách nhận được và % lợi nhuận DealHoàn giữ lại:
                  </p>
                </div>
                <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full border border-emerald-200">
                  Hệ số: {boosterSettings.boostFactor.toFixed(2)}x
                </span>
              </div>

              <div className="table-responsive">
                <table className="admin-data-table">
                  <thead>
                    <tr>
                      <th>Sản phẩm mẫu</th>
                      <th>Ngành hàng</th>
                      <th className="text-right">Giá niêm yết</th>
                      <th className="text-center">Hoàn Ngay (%)</th>
                      <th className="text-center">DealHoàn Thưởng</th>
                      <th className="text-center">DealHoàn Hoàn (%)</th>
                      <th className="text-right">Tiền hoàn khách nhận</th>
                      <th className="text-right">Lợi nhuận DealHoàn</th>
                      <th className="text-center">Đánh giá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SIMULATION_ITEMS.map((item, idx) => {
                      const res = calcSimResult(item.hnRate, item.price, boosterSettings);
                      return (
                        <tr key={idx} className="admin-table-row">
                          <td className="font-bold text-stone-900">{item.name}</td>
                          <td className="text-stone-500 text-xs">{item.category}</td>
                          <td className="text-right font-medium">{formatVnd(item.price)}</td>
                          <td className="text-center text-stone-500">{item.hnRate}%</td>
                          <td className="text-center font-bold text-orange-600">
                            {res.bonus > 0 ? `+${res.bonus}%` : "0%"}
                          </td>
                          <td className="text-center font-black text-stone-900 bg-orange-50/50">
                            {res.finalRate}%
                          </td>
                          <td className="text-right font-bold text-emerald-700">
                            {formatVnd(res.cashbackAmount)}
                          </td>
                          <td className="text-right font-black text-emerald-600">
                            {res.margin.toFixed(1)}%
                          </td>
                          <td className="text-center">
                            <span className="status-badge badge-active text-[11px]">
                              {res.margin >= 10 ? "✅ An toàn" : "⚠️ Cận biên"}
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

        {activeTab === "import" && (
          <section className="admin-import-container">
            {/* Header Card */}
            <div className="admin-settings-card">
              <div className="admin-settings-header">
                <div>
                  <h3>
                    <span>📥</span> Nhập Báo Cáo Chuyển Đổi Shopee (Tự Động Nạp Tiền Vào Ví)
                  </h3>
                  <p>
                    Giải pháp cho tài khoản chưa có Open API: Bạn chỉ cần tải file Excel/CSV từ Shopee về và nạp vào đây.
                    Hệ thống tự động nhận diện mã <code>Sub_ID</code> (khách hàng DealHoàn), áp dụng tỷ lệ hoàn Parabol và cộng thẳng tiền vào ví.
                  </p>
                </div>
                <span className="admin-security-badge">
                  <span>⚡</span> Khớp Tự Động 100%
                </span>
              </div>

              {/* 3 Steps Guide */}
              <div className="admin-instruction-steps">
                <div className="admin-step-box">
                  <div className="admin-step-num">1</div>
                  <div className="admin-step-title">Xuất file từ Shopee</div>
                  <p className="admin-step-desc">
                    Vào <b>Shopee Affiliate Portal</b> &rarr; mục <b>Báo cáo chuyển đổi (Conversion Report)</b> &rarr; chọn khoảng thời gian &rarr; bấm <b>Xuất file Excel / CSV</b>.
                  </p>
                </div>
                <div className="admin-step-box">
                  <div className="admin-step-num">2</div>
                  <div className="admin-step-title">Tải file vào DealHoàn</div>
                  <p className="admin-step-desc">
                    Kéo thả file CSV vừa tải về vào ô bên dưới, hoặc bấm nút <b>&quot;Thử file mẫu Shopee&quot;</b> để trải nghiệm thử.
                  </p>
                </div>
                <div className="admin-step-box">
                  <div className="admin-step-num">3</div>
                  <div className="admin-step-title">1 Click Nạp tiền</div>
                  <p className="admin-step-desc">
                    Hệ thống tự động lọc các đơn có gắn mã <code>u_User</code>, tính toán số tiền hoàn và cộng vào ví người dùng ngay tức thì!
                  </p>
                </div>
              </div>
            </div>

            {/* Auto-Sync with Cookie Card (Hands-free 24/7 Background Cron) */}
            <div className="admin-settings-card border-orange-200 bg-orange-50/20">
              <div className="admin-settings-header mb-3">
                <div>
                  <h3 className="text-orange-950 flex items-center gap-2">
                    <span>⚡</span> Tự Động Chạy Ngầm 24/7 (Hoàn Toàn Không Cần Bấm Nút)
                  </h3>
                  <p>
                    Hệ thống tích hợp <b>Cron Job chạy ngầm 24/7</b>: Cứ mỗi 15 phút, máy chủ tự động vào Shopee kéo đơn mới về, khớp <code>Sub_ID</code> và cộng thẳng tiền vào ví thành viên mà bạn không cần phải mở web hay bấm nút gì cả!
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                    className="admin-btn-primary bg-orange-600 hover:bg-orange-700 whitespace-nowrap text-xs py-2.5 px-4 font-bold"
                  >
                    {isSyncingShopee ? "Đang quét..." : "🔄 Quét Thủ Công Ngay"}
                  </button>
                </div>

                {/* Auto-Sync Status Info Bar */}
                <div className="p-3 bg-white rounded-xl border border-orange-200/80 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⏱️</span>
                    <div>
                      <span className="font-bold text-stone-800">Chu kỳ quét tự động:</span>
                      <span className="text-stone-600 ml-1">Mỗi 15 phút (Cron 24/7)</span>
                    </div>
                  </div>
                  {lastSyncAt && (
                    <div className="text-[11.5px] text-stone-500">
                      Lần quét gần nhất: <b className="text-stone-700">{formatDate(lastSyncAt)}</b>
                      {lastSyncResult && <span className="ml-1 text-emerald-700">({lastSyncResult})</span>}
                    </div>
                  )}
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

                <div className="text-[11.5px] text-stone-500 flex items-center gap-1">
                  <span>💡</span>
                  <span>Cách lấy Cookie 1 lần duy nhất: Đăng nhập <b>affiliate.shopee.vn</b> &rarr; nhấn <code>F12</code> &rarr; tab <code>Application</code> &rarr; <code>Cookies</code> &rarr; copy giá trị cookie.</span>
                </div>
              </div>
            </div>

            {/* Dropzone & File Input Card */}
            <div className="admin-settings-card">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h4 className="text-base font-bold text-stone-900 m-0 flex items-center gap-2">
                  <span>📊</span> Tải lên file Báo cáo đơn hàng (.csv, .xlsx, .txt)
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleUseDemoCsv}
                    className="text-xs bg-orange-100 hover:bg-orange-200 text-orange-800 font-bold px-3 py-1.5 rounded-lg transition-colors border border-orange-300"
                  >
                    🧪 Dùng file mẫu Shopee (Demo 5 đơn)
                  </button>
                  {parsedReport && (
                    <button
                      type="button"
                      onClick={() => {
                        setParsedReport(null);
                        setImportCsvText("");
                        setImportFileName("");
                        setImportResultSummary(null);
                      }}
                      className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Xóa dữ liệu đang xem
                    </button>
                  )}
                </div>
              </div>

              {/* Dropzone */}
              <div
                className={`admin-dropzone ${isDragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDropFile}
                onClick={() => document.getElementById("shopee-file-input")?.click()}
              >
                <input
                  id="shopee-file-input"
                  type="file"
                  accept=".csv,.tsv,.txt"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <div className="admin-dropzone-icon">📁</div>
                <div>
                  <p className="admin-dropzone-title">
                    {importFileName ? (
                      <span className="text-orange-600 font-bold">📄 {importFileName}</span>
                    ) : (
                      "Kéo thả file CSV của Shopee vào đây hoặc Bấm để chọn file"
                    )}
                  </p>
                  <p className="admin-dropzone-subtitle">
                    Hỗ trợ file báo cáo Shopee tiếng Việt (&quot;Mã đơn hàng&quot;, &quot;Sub_ID&quot;) và tiếng Anh (&quot;Order ID&quot;, &quot;Sub ID 1&quot;)
                  </p>
                </div>
              </div>

              {/* Success Result Banner */}
              {importResultSummary && (
                <div
                  className={`mt-4 p-4 rounded-xl border ${
                    importResultSummary.success
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : "bg-red-50 border-red-200 text-red-900"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{importResultSummary.success ? "🎉" : "⚠️"}</span>
                    <div>
                      <p className="font-bold text-sm m-0">{importResultSummary.message}</p>
                      {importResultSummary.details && (
                        <p className="text-xs text-emerald-700 mt-1 m-0">
                          Đã nạp {importResultSummary.details.successCount} đơn &bull; Khớp {importResultSummary.details.matchedUsersCount} thành viên &bull; Tổng tiền hoàn ví: {formatVnd(importResultSummary.details.totalCashback)} &bull; DealHoàn giữ lãi: {importResultSummary.details.netProfitMargin}%
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Parsed Report Preview */}
            {parsedReport && (
              <div className="admin-settings-card">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <h4 className="text-base font-bold text-stone-900 m-0 flex items-center gap-2">
                    <span>🔍</span> Kết Quả Phân Tích Dữ Liệu File
                  </h4>
                  <span className="text-xs bg-stone-100 text-stone-700 font-bold px-2.5 py-1 rounded-full">
                    {parsedReport.totalRows} dòng đơn hàng
                  </span>
                </div>

                {/* Stat badges */}
                <div className="admin-import-stats-grid">
                  <div className="admin-import-stat-card">
                    <span className="admin-import-stat-title">Tổng đơn trong file</span>
                    <span className="admin-import-stat-value">{parsedReport.totalRows}</span>
                    <span className="admin-import-stat-note">Bao gồm cả đơn không có SubID</span>
                  </div>

                  <div className="admin-import-stat-card highlight">
                    <span className="admin-import-stat-title">Đơn khớp khách DealHoàn</span>
                    <span className="admin-import-stat-value">{parsedReport.validOrders.length}</span>
                    <span className="admin-import-stat-note">Có mã Sub_ID dạng u_User</span>
                  </div>

                  <div className="admin-import-stat-card">
                    <span className="admin-import-stat-title">Hoa hồng Shopee trả</span>
                    <span className="admin-import-stat-value">{formatVnd(parsedReport.totalCommission)}</span>
                    <span className="admin-import-stat-note">Doanh thu sàn ghi nhận</span>
                  </div>

                  <div className="admin-import-stat-card highlight">
                    <span className="admin-import-stat-title">Cộng vào ví thành viên</span>
                    <span className="admin-import-stat-value">{formatVnd(parsedReport.totalCashback)}</span>
                    <span className="admin-import-stat-note">Đã áp dụng công thức thưởng</span>
                  </div>
                </div>

                {/* Table preview */}
                <div className="table-responsive mt-4">
                  <table className="admin-data-table">
                    <thead>
                      <tr>
                        <th>Mã đơn Shopee</th>
                        <th>Thành viên DealHoàn (SubID)</th>
                        <th>Sản phẩm</th>
                        <th className="text-right">Giá trị đơn</th>
                        <th className="text-right">Hoa hồng sàn</th>
                        <th className="text-right">Tiền hoàn về ví</th>
                        <th className="text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedReport.validOrders.map((ord, idx) => {
                        // Find matching user from existing users list for friendly display
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
                              {formatVnd(ord.cashbackAmount)}
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
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Action button */}
                <div className="admin-import-actions">
                  <span className="text-xs text-stone-500">
                    Sẽ cộng tiền cho <b>{parsedReport.validOrders.length}</b> đơn hàng hợp lệ
                  </span>
                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    disabled={isProcessingImport || parsedReport.validOrders.length === 0}
                    className="admin-import-submit-btn"
                  >
                    {isProcessingImport ? (
                      <>
                        <span className="animate-spin inline-block mr-1">⏳</span>
                        <span>Đang xử lý nạp tiền...</span>
                      </>
                    ) : (
                      <>
                        <span>🚀</span>
                        <span>Xác Nhận Nạp {parsedReport.validOrders.length} Đơn Vào Ví Thành Viên</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
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
              {/* Section 1: Thống kê ví của User */}
              <div className="modal-section-grid">
                <div className="modal-stat-box green-box">
                  <span className="box-label">SỐ DƯ KHẢ DỤNG</span>
                  <span className="box-val green-text">{formatVnd(selectedUser.balance)}</span>
                  <span className="box-hint">Có thể rút ngay</span>
                </div>
                <div className="modal-stat-box amber-box">
                  <span className="box-label">TIỀN CHỜ HOÀN</span>
                  <span className="box-val amber-text">{formatVnd(selectedUser.pendingBalance)}</span>
                  <span className="box-hint">Đang đối soát sàn</span>
                </div>
                <div className="modal-stat-box blue-box">
                  <span className="box-label">TỔNG ĐÃ RÚT</span>
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
                  <div className="unlinked-alert">
                    <p>⚠️ Người dùng này chưa cập nhật thông tin tài khoản ngân hàng nhận tiền.</p>
                  </div>
                )}
              </div>

              {/* Section 3: Điều chỉnh số dư Admin */}
              <div className="modal-card-block">
                <div className="block-title-row">
                  <div className="flex items-center gap-2">
                    <span className="block-icon">⚙️</span>
                    <h4 className="block-title">Điều Chỉnh Số Dư (Quyền Admin)</h4>
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
                    Người dùng này chưa có đơn hàng hoàn tiền nào. Bạn có thể bấm nút <b>+ Test</b> phía trên để tạo đơn thử nghiệm.
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
                    Người dùng này chưa có yêu cầu rút tiền nào.
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
