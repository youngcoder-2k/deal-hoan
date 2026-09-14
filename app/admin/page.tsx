import { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import AdminUsersClient from "./admin-users-client";
import { isAdminUser } from "@/lib/auth/admin";
import { calculateKPIStats, fetchRealAdminUsers } from "@/lib/auth/admin-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Quản Lý Người Dùng & Số Dư — DealHoàn Admin",
  description: "Trang quản trị danh sách người dùng, số dư ví và thông tin tài khoản ngân hàng hệ thống DealHoàn.",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const adminKey = cookieStore.get("dealhoan_admin_key")?.value;
  const configuredKey = process.env.ADMIN_SECRET_KEY || "dealhoan2025";

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

  // Cho phép xác thực qua Cookie mã khóa dự phòng
  if (adminKey && adminKey === configuredKey) {
    isAuthorized = true;
  }

  // Cho phép test trong môi trường dev local khi chưa cấu hình Supabase
  if (!hasSupabaseConfig && process.env.NODE_ENV !== "production") {
    isAuthorized = true;
  }

  // Nếu không phải Admin, hiển thị màn hình từ chối truy cập (403 Forbidden)
  if (!isAuthorized) {
    return (
      <div className="admin-forbidden-container">
        <div className="admin-forbidden-card">
          <div className="forbidden-icon">🛡️</div>
          <h2>Khu Vực Quản Trị Viên</h2>
          <p>
            {currentUserEmail ? (
              <>
                Tài khoản <b>{currentUserEmail}</b> là tài khoản người dùng thông thường và <b>không có quyền truy cập</b> trang quản trị của hệ thống DealHoàn.
              </>
            ) : (
              <>Bạn cần đăng nhập bằng tài khoản Google của Quản trị viên để truy cập trang này.</>
            )}
          </p>
          <div className="forbidden-actions">
            <Link href="/" className="admin-btn-primary">
              ← Quay về trang chủ DealHoàn
            </Link>
          </div>
          <div className="forbidden-note">
            <span>⚠️ Chỉ các email quản trị nằm trong danh sách cấp phép (whitelist) mới có quyền xem thông tin này.</span>
          </div>
        </div>
      </div>
    );
  }

  // Lấy dữ liệu người dùng THẬT từ Supabase (auth.users, user_wallets, withdrawal_requests)
  const { users: realUsers, isRealData } = await fetchRealAdminUsers();
  const initialStats = calculateKPIStats(realUsers);

  return (
    <AdminUsersClient
      initialUsers={realUsers}
      initialStats={initialStats}
      isInitialRealData={isRealData}
    />
  );
}
