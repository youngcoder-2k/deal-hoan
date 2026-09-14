import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import {
  AdminUserItem,
  DEMO_ADMIN_USERS,
  getAdminEmails,
  getSupabaseAdminClient,
  isAdminUser,
} from "@/lib/auth/admin";
import { calculateKPIStats, fetchRealAdminUsers } from "@/lib/auth/admin-server";

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
    const sort = searchParams.get("sort") || "smart_desc";

    // Lấy dữ liệu người dùng thật từ Supabase (auth.users + user_wallets + withdrawal_requests)
    const { users: rawUsers, isRealData } = await fetchRealAdminUsers();
    const stats = calculateKPIStats(rawUsers);

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

    // Sắp xếp: Ưu tiên người dùng mới nhất và có số dư lớn nhất lên đầu
    filtered.sort((a, b) => {
      if (sort === "smart_desc" || !sort) {
        const now = Date.now();
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const aIsNew = now - new Date(a.createdAt).getTime() < SEVEN_DAYS_MS;
        const bIsNew = now - new Date(b.createdAt).getTime() < SEVEN_DAYS_MS;

        // Cả 2 đều mới (trong 7 ngày)
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
      if (sort === "balance_desc") {
        if (b.balance !== a.balance) return b.balance - a.balance;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sort === "balance_asc") {
        if (a.balance !== b.balance) return a.balance - b.balance;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sort === "created_desc") {
        const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.balance - a.balance;
      }
      if (sort === "created_asc") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sort === "withdrawn_desc") {
        if (b.totalWithdrawn !== a.totalWithdrawn) return b.totalWithdrawn - a.totalWithdrawn;
        return b.balance - a.balance;
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
      isRealData,
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
