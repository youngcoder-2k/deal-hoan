import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import {
  AdminUserItem,
  AdminKPIStats,
  DEMO_ADMIN_USERS,
  getAdminEmails,
  getSupabaseAdminClient,
  isAdminUser,
} from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

// Bộ nhớ tạm in-memory cho môi trường dev/demo
const inMemoryUsers: AdminUserItem[] = [...DEMO_ADMIN_USERS];

async function checkAdminAuth(request: NextRequest) {
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
    console.warn("Check admin auth error:", err);
  }

  // 2. Kiểm tra Header hoặc Cookie Secret Key
  const adminKey =
    request.headers.get("x-admin-key") ||
    request.cookies.get("dealhoan_admin_key")?.value;
  const configuredKey = process.env.ADMIN_SECRET_KEY || "dealhoan2025";

  if (adminKey && adminKey === configuredKey) {
    return { isAuthorized: true, method: "admin_key" };
  }

  // 3. Cho phép truy cập trong môi trường demo/dev khi chưa cấu hình Supabase
  if (!hasSupabaseConfig) {
    return { isAuthorized: true, method: "dev_mode" };
  }

  return { isAuthorized: false };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAdminAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json(
        {
          error: "Không có quyền truy cập trang quản trị. Vui lòng đăng nhập với tài khoản Admin.",
          adminEmails: getAdminEmails(),
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim().toLowerCase();
    const bankStatus = searchParams.get("bank_status") || "all";
    const balanceStatus = searchParams.get("balance_status") || "all";
    const sort = searchParams.get("sort") || "balance_desc";

    let rawUsers: AdminUserItem[] = [];

    const supabaseAdmin = getSupabaseAdminClient();

    if (supabaseAdmin) {
      try {
        // 1. Lấy danh sách users từ auth.users nếu có quyền admin
        const { data: authData, error: authListErr } =
          await supabaseAdmin.auth.admin.listUsers({
            page: 1,
            perPage: 500,
          });

        // 2. Lấy dữ liệu ví từ user_wallets
        const { data: walletsData } = await supabaseAdmin
          .from("user_wallets")
          .select("*");

        // 3. Lấy dữ liệu rút tiền từ withdrawal_requests
        const { data: withdrawalsData } = await supabaseAdmin
          .from("withdrawal_requests")
          .select("*")
          .order("created_at", { ascending: false });

        if (!authListErr && authData?.users && authData.users.length > 0) {
          const walletsMap = new Map<string, Record<string, unknown>>();
          (walletsData || []).forEach((w) => {
            if (w.user_id) walletsMap.set(String(w.user_id), w);
          });

          const withdrawalsMap = new Map<string, Array<Record<string, unknown>>>();
          (withdrawalsData || []).forEach((w) => {
            const uid = String(w.user_id);
            if (!withdrawalsMap.has(uid)) withdrawalsMap.set(uid, []);
            withdrawalsMap.get(uid)?.push(w);
          });

          rawUsers = authData.users.map((u) => {
            const wallet = walletsMap.get(u.id);
            const userWithdrawals = withdrawalsMap.get(u.id) || [];
            const latestW = userWithdrawals[0];

            const metaBankName = String(u.user_metadata?.bank_name || "");
            const metaAccountNo = String(u.user_metadata?.bank_account_no || "");
            const metaAccountName = String(u.user_metadata?.bank_account_name || "");

            const bankName = String(wallet?.bank_name || metaBankName || "");
            const bankAccountNo = String(wallet?.bank_account_no || metaAccountNo || "");
            const bankAccountName = String(wallet?.bank_account_name || metaAccountName || "");

            const balance = Number(wallet?.balance ?? 0);
            const pendingBalance = Number(wallet?.pending_balance ?? 0);
            const totalWithdrawn = Number(wallet?.total_withdrawn ?? 0);

            const isBankConfigured = Boolean(
              bankName && bankAccountNo && bankAccountName
            );

            return {
              id: u.id,
              refCode: `u_${u.id.slice(0, 8)}`,
              email: u.email || "",
              fullName:
                String(
                  u.user_metadata?.full_name ||
                    u.user_metadata?.name ||
                    u.email?.split("@")[0] ||
                    "Người dùng"
                ),
              avatarUrl:
                String(u.user_metadata?.avatar_url || u.user_metadata?.picture || "") || undefined,
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
              isBankConfigured,
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
        } else {
          rawUsers = inMemoryUsers;
        }
      } catch (err) {
        console.warn("Supabase query fallback to in-memory:", err);
        rawUsers = inMemoryUsers;
      }
    } else {
      rawUsers = inMemoryUsers;
    }

    // Tính toán KPI Stats trên toàn bộ tập dữ liệu
    const totalUsers = rawUsers.length;
    const totalBalance = rawUsers.reduce((sum, u) => sum + (u.balance || 0), 0);
    const totalPendingBalance = rawUsers.reduce(
      (sum, u) => sum + (u.pendingBalance || 0),
      0
    );
    const totalWithdrawn = rawUsers.reduce(
      (sum, u) => sum + (u.totalWithdrawn || 0),
      0
    );
    const bankLinkedUsers = rawUsers.filter((u) => u.isBankConfigured).length;
    const bankLinkedRate =
      totalUsers > 0 ? Math.round((bankLinkedUsers / totalUsers) * 100) : 0;

    const stats: AdminKPIStats = {
      totalUsers,
      totalBalance,
      totalPendingBalance,
      totalWithdrawn,
      bankLinkedUsers,
      bankLinkedRate,
    };

    // Áp dụng bộ lọc tìm kiếm
    let filtered = [...rawUsers];

    if (query) {
      filtered = filtered.filter((u) => {
        return (
          u.email.toLowerCase().includes(query) ||
          u.fullName.toLowerCase().includes(query) ||
          u.refCode.toLowerCase().includes(query) ||
          u.id.toLowerCase().includes(query) ||
          u.bankName.toLowerCase().includes(query) ||
          u.bankAccountNo.toLowerCase().includes(query) ||
          u.bankAccountName.toLowerCase().includes(query)
        );
      });
    }

    // Lọc theo trạng thái ngân hàng
    if (bankStatus === "linked") {
      filtered = filtered.filter((u) => u.isBankConfigured);
    } else if (bankStatus === "unlinked") {
      filtered = filtered.filter((u) => !u.isBankConfigured);
    }

    // Lọc theo trạng thái số dư
    if (balanceStatus === "positive") {
      filtered = filtered.filter((u) => u.balance > 0);
    } else if (balanceStatus === "zero") {
      filtered = filtered.filter((u) => u.balance === 0);
    } else if (balanceStatus === "pending") {
      filtered = filtered.filter((u) => u.pendingBalance > 0);
    }

    // Sắp xếp
    filtered.sort((a, b) => {
      if (sort === "balance_desc") {
        return b.balance - a.balance;
      }
      if (sort === "balance_asc") {
        return a.balance - b.balance;
      }
      if (sort === "created_desc") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sort === "created_asc") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sort === "withdrawn_desc") {
        return b.totalWithdrawn - a.totalWithdrawn;
      }
      if (sort === "name_asc") {
        return a.fullName.localeCompare(b.fullName, "vi");
      }
      return 0;
    });

    return NextResponse.json({
      success: true,
      stats,
      users: filtered,
      totalCount: rawUsers.length,
      filteredCount: filtered.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await checkAdminAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json(
        { error: "Không có quyền thực hiện thao tác này." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId, balance, pendingBalance, bankName, bankAccountNo, bankAccountName } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "Thiếu thông tin userId cần cập nhật." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdminClient();

    if (supabaseAdmin) {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (typeof balance === "number") updateData.balance = balance;
      if (typeof pendingBalance === "number") updateData.pending_balance = pendingBalance;
      if (typeof bankName === "string") updateData.bank_name = bankName;
      if (typeof bankAccountNo === "string") updateData.bank_account_no = bankAccountNo;
      if (typeof bankAccountName === "string") updateData.bank_account_name = bankAccountName;

      await supabaseAdmin
        .from("user_wallets")
        .upsert({
          user_id: userId,
          ...updateData,
        });
    }

    // Cập nhật cả inMemoryUsers
    const idx = inMemoryUsers.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      const existing = inMemoryUsers[idx];
      inMemoryUsers[idx] = {
        ...existing,
        balance: typeof balance === "number" ? balance : existing.balance,
        pendingBalance: typeof pendingBalance === "number" ? pendingBalance : existing.pendingBalance,
        bankName: typeof bankName === "string" ? bankName : existing.bankName,
        bankAccountNo: typeof bankAccountNo === "string" ? bankAccountNo : existing.bankAccountNo,
        bankAccountName: typeof bankAccountName === "string" ? bankAccountName : existing.bankAccountName,
        isBankConfigured: Boolean(
          (typeof bankAccountNo === "string" ? bankAccountNo : existing.bankAccountNo) &&
          (typeof bankName === "string" ? bankName : existing.bankName)
        ),
      };
    }

    return NextResponse.json({
      success: true,
      message: "Cập nhật thông tin người dùng thành công.",
      updatedUser: inMemoryUsers.find((u) => u.id === userId),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
