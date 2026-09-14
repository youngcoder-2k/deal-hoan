import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AdminKPIStats,
  AdminUserItem,
  DEMO_ADMIN_USERS,
  getSupabaseAdminClient,
  isAdminUser,
} from "./admin";

/**
 * Kiểm tra quyền Quản trị viên cho các Admin API Route (/api/admin/*)
 * - Yêu cầu:
 *   1. User đăng nhập qua Supabase Auth có email thuộc Whitelist hoặc role admin.
 *   2. Hoặc request mang ADMIN_SECRET_KEY hợp lệ (được cấu hình tường minh trong biến môi trường).
 * - Tuyệt đối không có cơ chế bypass dev/demo hoặc fallback mật khẩu mặc định.
 */
export async function checkAdminApiAuth(request: NextRequest): Promise<{
  isAuthorized: boolean;
  user?: any;
  method?: string;
  error?: string;
}> {
  // 1. Kiểm tra session Supabase người dùng hiện tại
  try {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && isAdminUser(user)) {
        return { isAuthorized: true, user, method: "supabase_session" };
      }
    }
  } catch (err) {
    console.warn("Check admin API auth error:", err);
  }

  // 2. Kiểm tra Header, Cookie hoặc Query Secret Key (nếu ADMIN_SECRET_KEY được thiết lập tường minh)
  const configuredKey = process.env.ADMIN_SECRET_KEY?.trim();
  if (configuredKey) {
    const headerKey = request.headers.get("x-admin-key")?.trim();
    const cookieKey = request.cookies.get("dealhoan_admin_key")?.value?.trim();
    const queryKey = request.nextUrl.searchParams.get("key")?.trim();

    if (
      (headerKey && headerKey === configuredKey) ||
      (cookieKey && cookieKey === configuredKey) ||
      (queryKey && queryKey === configuredKey)
    ) {
      return { isAuthorized: true, method: "admin_key" };
    }
  }

  return {
    isAuthorized: false,
    error: "Chỉ quản trị viên hệ thống DealHoàn mới có quyền truy cập.",
  };
}

/**
 * Tính toán số liệu thống kê KPI từ danh sách người dùng
 */
export function calculateKPIStats(users: AdminUserItem[]): AdminKPIStats {
  const totalUsers = users.length;
  const totalBalance = users.reduce((sum, u) => sum + (u.balance || 0), 0);
  const totalPendingBalance = users.reduce(
    (sum, u) => sum + (u.pendingBalance || 0),
    0
  );
  const totalWithdrawn = users.reduce(
    (sum, u) => sum + (u.totalWithdrawn || 0),
    0
  );
  const bankLinkedUsers = users.filter((u) => u.isBankConfigured).length;
  const bankLinkedRate =
    totalUsers > 0 ? Math.round((bankLinkedUsers / totalUsers) * 100) : 0;

  return {
    totalUsers,
    totalBalance,
    totalPendingBalance,
    totalWithdrawn,
    bankLinkedUsers,
    bankLinkedRate,
  };
}

/**
 * Truy vấn danh sách người dùng THẬT từ Supabase (auth.users + user_wallets + withdrawal_requests)
 * Tự động fallback sang DEMO_ADMIN_USERS nếu chưa cấu hình CSDL hoặc CSDL chưa có người dùng nào.
 */
export async function fetchRealAdminUsers(): Promise<{
  users: AdminUserItem[];
  isRealData: boolean;
}> {
  const supabaseAdmin = getSupabaseAdminClient();
  let supabaseServer: any = null;

  try {
    supabaseServer = await createSupabaseServerClient();
  } catch (err) {
    console.warn("Could not create supabaseServerClient:", err);
  }

  const clientToUse = supabaseAdmin || supabaseServer;
  if (!clientToUse) {
    return { users: DEMO_ADMIN_USERS, isRealData: false };
  }

  let realUsers: AdminUserItem[] = [];

  try {
    // 1. Thử lấy danh sách tài khoản từ auth.users nếu client có quyền Service Role
    let authUsers: any[] = [];
    if (supabaseAdmin?.auth?.admin) {
      try {
        const { data: authData, error: authListErr } =
          await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 1000,
          });
        if (!authListErr && authData?.users && authData.users.length > 0) {
          authUsers = authData.users;
        }
      } catch (authErr) {
        console.warn("auth.admin.listUsers error:", authErr);
      }
    }

    // 2. Lấy dữ liệu ví từ bảng user_wallets
    let walletsData: any[] = [];
    try {
      const { data: wData, error: wErr } = await clientToUse
        .from("user_wallets")
        .select("*");
      if (!wErr && Array.isArray(wData)) {
        walletsData = wData;
      }
    } catch (wCatch) {
      console.warn("user_wallets query error:", wCatch);
    }

    // 3. Lấy dữ liệu các lệnh rút tiền từ withdrawal_requests
    let withdrawalsData: any[] = [];
    try {
      const { data: wrData, error: wrErr } = await clientToUse
        .from("withdrawal_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (!wrErr && Array.isArray(wrData)) {
        withdrawalsData = wrData;
      }
    } catch (wrCatch) {
      console.warn("withdrawal_requests query error:", wrCatch);
    }

    // 4. Nếu auth.admin không có nhưng có view admin_user_overview
    if (authUsers.length === 0 && walletsData.length === 0) {
      try {
        const { data: overviewData, error: overviewErr } = await clientToUse
          .from("admin_user_overview")
          .select("*");
        if (!overviewErr && Array.isArray(overviewData) && overviewData.length > 0) {
          realUsers = overviewData.map((row: any) => {
            const uid = String(row.user_id || row.id);
            const balance = Number(row.balance || 0);
            const pendingBalance = Number(row.pending_balance || 0);
            const totalWithdrawn = Number(row.total_withdrawn || 0);
            const bankName = String(row.bank_name || "");
            const bankAccountNo = String(row.bank_account_no || "");
            const bankAccountName = String(row.bank_account_name || "");

            return {
              id: uid,
              refCode: `u_${uid.slice(0, 8)}`,
              email: String(row.email || ""),
              fullName: String(
                row.full_name || row.email?.split("@")[0] || "Người dùng"
              ),
              avatarUrl: row.avatar_url || undefined,
              role: "user",
              createdAt: String(
                row.user_created_at || row.created_at || new Date().toISOString()
              ),
              lastSignInAt: row.last_sign_in_at
                ? String(row.last_sign_in_at)
                : undefined,
              balance,
              pendingBalance,
              totalWithdrawn,
              totalEarned: balance + totalWithdrawn,
              bankName,
              bankAccountNo,
              bankAccountName,
              isBankConfigured: Boolean(bankName && bankAccountNo),
              withdrawalCount: Number(row.total_withdrawal_requests || 0),
              latestWithdrawal: null,
            };
          });
          return { users: realUsers, isRealData: true };
        }
      } catch (ovCatch) {
        // ignore
      }
    }

    // Map wallets và withdrawals theo user_id
    const walletsMap = new Map<string, any>();
    walletsData.forEach((w) => {
      if (w.user_id) walletsMap.set(String(w.user_id), w);
    });

    const withdrawalsMap = new Map<string, any[]>();
    withdrawalsData.forEach((w) => {
      const uid = String(w.user_id);
      if (!withdrawalsMap.has(uid)) withdrawalsMap.set(uid, []);
      withdrawalsMap.get(uid)?.push(w);
    });

    // 5. Nếu lấy được authUsers từ Supabase Auth
    if (authUsers.length > 0) {
      realUsers = authUsers.map((u: any) => {
        const wallet = walletsMap.get(u.id);
        const userWithdrawals = withdrawalsMap.get(u.id) || [];
        const latestW = userWithdrawals[0];

        const metaBankName = String(u.user_metadata?.bank_name || "");
        const metaAccountNo = String(u.user_metadata?.bank_account_no || "");
        const metaAccountName = String(u.user_metadata?.bank_account_name || "");

        const bankName = String(wallet?.bank_name || metaBankName || "");
        const bankAccountNo = String(wallet?.bank_account_no || metaAccountNo || "");
        const bankAccountName = String(wallet?.bank_account_name || metaAccountName || "");

        const balance = Number(
          wallet?.balance ?? u.user_metadata?.balance ?? 0
        );
        const pendingBalance = Number(
          wallet?.pending_balance ?? u.user_metadata?.pending_balance ?? 0
        );
        const totalWithdrawn = Number(
          wallet?.total_withdrawn ?? u.user_metadata?.total_withdrawn ?? 0
        );

        return {
          id: u.id,
          refCode: `u_${u.id.slice(0, 8)}`,
          email: u.email || "",
          fullName: String(
            u.user_metadata?.full_name ||
              u.user_metadata?.name ||
              u.email?.split("@")[0] ||
              "Người dùng"
          ),
          avatarUrl:
            String(u.user_metadata?.avatar_url || u.user_metadata?.picture || "") ||
            undefined,
          role: isAdminUser(u) ? "admin" : "user",
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at,
          balance,
          pendingBalance,
          totalWithdrawn,
          totalEarned: balance + totalWithdrawn,
          bankName,
          bankAccountNo,
          bankAccountName,
          isBankConfigured: Boolean(bankName && bankAccountNo),
          withdrawalCount: userWithdrawals.length,
          latestWithdrawal: latestW
            ? {
                id: String(latestW.id),
                amount: Number(latestW.amount),
                status: latestW.status as "pending" | "completed" | "rejected",
                createdAt: String(latestW.created_at),
                note: latestW.note ? String(latestW.note) : null,
              }
            : null,
        };
      });
    } else if (walletsData.length > 0) {
      // Nếu auth.admin bị hạn chế nhưng bảng user_wallets có bản ghi thực
      realUsers = walletsData.map((w: any) => {
        const uid = String(w.user_id);
        const userWithdrawals = withdrawalsMap.get(uid) || [];
        const latestW = userWithdrawals[0];
        const balance = Number(w.balance ?? 0);
        const pendingBalance = Number(w.pending_balance ?? 0);
        const totalWithdrawn = Number(w.total_withdrawn ?? 0);
        const bankName = String(w.bank_name || "");
        const bankAccountNo = String(w.bank_account_no || "");
        const bankAccountName = String(w.bank_account_name || "");

        return {
          id: uid,
          refCode: `u_${uid.slice(0, 8)}`,
          email: `${bankAccountName ? bankAccountName.toLowerCase().replace(/\s+/g, ".") : "user"}.${uid.slice(0, 4)}@dealhoan.vn`,
          fullName: bankAccountName || `Người dùng ${uid.slice(0, 8)}`,
          role: "user",
          createdAt: w.created_at || new Date().toISOString(),
          balance,
          pendingBalance,
          totalWithdrawn,
          totalEarned: balance + totalWithdrawn,
          bankName,
          bankAccountNo,
          bankAccountName,
          isBankConfigured: Boolean(bankName && bankAccountNo),
          withdrawalCount: userWithdrawals.length,
          latestWithdrawal: latestW
            ? {
                id: String(latestW.id),
                amount: Number(latestW.amount),
                status: latestW.status,
                createdAt: String(latestW.created_at),
                note: latestW.note,
              }
            : null,
        };
      });
    }

    if (realUsers.length > 0) {
      return { users: realUsers, isRealData: true };
    }
  } catch (err) {
    console.warn("fetchRealAdminUsers fallback to demo:", err);
  }

  return { users: DEMO_ADMIN_USERS, isRealData: false };
}
