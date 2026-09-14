import { Metadata } from "next";
import AdminUsersClient from "./admin-users-client";
import {
  AdminKPIStats,
  DEMO_ADMIN_USERS,
} from "@/lib/auth/admin";

export const metadata: Metadata = {
  title: "Quản Lý Người Dùng & Số Dư — DealHoàn Admin",
  description: "Trang quản trị danh sách người dùng, số dư ví và thông tin tài khoản ngân hàng hệ thống DealHoàn.",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Tính toán KPI ban đầu từ dữ liệu nền
  const totalUsers = DEMO_ADMIN_USERS.length;
  const totalBalance = DEMO_ADMIN_USERS.reduce((sum, u) => sum + u.balance, 0);
  const totalPendingBalance = DEMO_ADMIN_USERS.reduce((sum, u) => sum + u.pendingBalance, 0);
  const totalWithdrawn = DEMO_ADMIN_USERS.reduce((sum, u) => sum + u.totalWithdrawn, 0);
  const bankLinkedUsers = DEMO_ADMIN_USERS.filter((u) => u.isBankConfigured).length;
  const bankLinkedRate = totalUsers > 0 ? Math.round((bankLinkedUsers / totalUsers) * 100) : 0;

  const initialStats: AdminKPIStats = {
    totalUsers,
    totalBalance,
    totalPendingBalance,
    totalWithdrawn,
    bankLinkedUsers,
    bankLinkedRate,
  };

  return (
    <AdminUsersClient
      initialUsers={DEMO_ADMIN_USERS}
      initialStats={initialStats}
    />
  );
}
