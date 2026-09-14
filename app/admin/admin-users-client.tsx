"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import type { AdminUserItem, AdminKPIStats } from "@/lib/auth/admin";

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

export default function AdminUsersClient({
  initialUsers,
  initialStats,
  isInitialRealData = false,
}: {
  initialUsers: AdminUserItem[];
  initialStats: AdminKPIStats;
  isInitialRealData?: boolean;
}) {
  const [users, setUsers] = useState<AdminUserItem[]>(initialUsers);
  const [stats, setStats] = useState<AdminKPIStats>(initialStats);
  const [isRealData, setIsRealData] = useState<boolean>(isInitialRealData);
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Tự động tải dữ liệu thực tế mới nhất từ CSDL khi trang mount
  useEffect(() => {
    let isMounted = true;
    async function syncRealData() {
      try {
        const res = await fetch("/api/admin/users");
        const data = await res.json();
        if (isMounted && res.ok && data.users) {
          setUsers(data.users);
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
        setUsers(data.users);
        if (data.stats) setStats(data.stats);
        if (typeof data.isRealData === "boolean") {
          setIsRealData(data.isRealData);
        }
        showToast(
          data.isRealData
            ? `✓ Đã cập nhật ${data.users.length} người dùng thật từ CSDL`
            : "✓ Đã cập nhật dữ liệu mới nhất"
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
      setTimeout(() => setCopiedId(null), 2000);
    }
    showToast(`✓ Đã sao chép ${label}: ${text}`);
  };

  // Mở modal xem chi tiết người dùng
  const openUserDetail = async (user: AdminUserItem) => {
    setSelectedUser(user);
    setNewBalance(user.balance);
    setNewPending(user.pendingBalance);
    setAdjustBalanceMode(false);
    setAdjustNote("");
    setLoadingWithdrawals(true);

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
        showToast("✅ Đã cập nhật số dư cho " + selectedUser.fullName);
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
            ? "✅ Đã xác nhận chuyển tiền thành công!"
            : "❌ Đã từ chối lệnh rút tiền"
        );
        setUserWithdrawals((prev) =>
          prev.map((w) =>
            w.id === withdrawalId ? { ...w, status: newStatus, note: promptNote } : w
          )
        );
        refreshData();
      }
    } catch {
      showToast("⚠️ Lỗi khi cập nhật trạng thái lệnh rút");
    }
  };

  // Xuất file CSV danh sách người dùng & ngân hàng
  const exportToCsv = () => {
    if (filteredUsers.length === 0) {
      return showToast("⚠️ Không có người dùng nào để xuất file");
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

    showToast(`📥 Đã tải xuống CSV (${filteredUsers.length} người dùng)`);
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

      <main className="admin-main">
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

              {/* Section 4: Lịch sử các lệnh rút tiền */}
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
