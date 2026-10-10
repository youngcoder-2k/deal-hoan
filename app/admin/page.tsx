import { Metadata } from "next";
import { cookies } from "next/headers";
import AdminUsersClient from "./admin-users-client";
import AdminForbiddenView from "./admin-forbidden";
import { isAdminUser } from "@/lib/auth/admin";
import { calculateKPIStats, fetchRealAdminUsers } from "@/lib/auth/admin-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Quản Lý Người Dùng & Số Dư — DealHoàn Admin",
  description: "Trang quản trị danh sách người dùng, số dư ví và thông tin tài khoản ngân hàng hệ thống DealHoàn.",
};

export const dynamic = "force-dynamic";

export default async function AdminPage(props: {
  searchParams?: Promise<{ key?: string; tab?: string }>;
}) {
  const cookieStore = await cookies();
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const adminKey = cookieStore.get("dealhoan_admin_key")?.value?.trim();
  const queryKey = searchParams?.key?.trim();
  const configuredKey = process.env.ADMIN_SECRET_KEY?.trim() || "dealhoan2026";

  let isAuthorized = false;
  let currentUserEmail: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        currentUserEmail = user.email || null;
        if (isAdminUser(user)) {
          isAuthorized = true;
        }
      }
    }
  } catch (err) {
    console.warn("Server admin auth check error:", err);
  }

  // Cho phép xác thực qua ADMIN_SECRET_KEY hoặc mã master key dealhoan2026
  if (
    adminKey === configuredKey ||
    queryKey === configuredKey ||
    queryKey === "dealhoan2026" ||
    adminKey === "dealhoan2026"
  ) {
    isAuthorized = true;
  }

  // Cho phép truy cập trực tiếp trên môi trường dev (localhost)
  if (process.env.NODE_ENV !== "production") {
    isAuthorized = true;
  }

  // Nếu không phải Admin hệ thống, hiển thị màn hình từ chối truy cập (403 Forbidden)
  if (!isAuthorized) {
    return (
      <AdminForbiddenView
        currentUserEmail={currentUserEmail}
        hasSecretKeyConfigured={true}
      />
    );
  }

  // Lấy dữ liệu người dùng THẬT từ Supabase (auth.users, user_wallets, withdrawal_requests)
  const { users: realUsers, isRealData } = await fetchRealAdminUsers();
  const initialStats = calculateKPIStats(realUsers);

  const initialTab =
    searchParams?.tab === "import" || searchParams?.tab === "shopee"
      ? "import"
      : searchParams?.tab === "settings"
      ? "settings"
      : "users";

  return (
    <AdminUsersClient
      initialUsers={realUsers}
      initialStats={initialStats}
      isInitialRealData={isRealData}
      initialTab={initialTab}
    />
  );
}
