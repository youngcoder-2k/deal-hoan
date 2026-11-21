import { NextRequest, NextResponse } from "next/server";
import {
  AdminUserItem,
  DEMO_ADMIN_USERS,
  getSupabaseAdminClient,
} from "@/lib/auth/admin";
import {
  calculateKPIStats,
  checkAdminApiAuth,
  fetchRealAdminUsers,
} from "@/lib/auth/admin-server";
import { updateSharedWallet } from "@/lib/deals/user-wallet-store";
import { appendWalletLedgerFallback } from "@/lib/referral/service";

export const dynamic = "force-dynamic";

// Bộ nhớ tạm in-memory cho môi trường dev/demo
const inMemoryUsers: AdminUserItem[] = [...DEMO_ADMIN_USERS];

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json(
        {
          error: "Không có quyền truy cập trang quản trị. Vui lòng đăng nhập với tài khoản Admin.",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim().toLowerCase();
    const bankStatus = searchParams.get("bank_status") || "all";
    const balanceStatus = searchParams.get("balance_status") || "all";
    const sort = searchParams.get("sort") || "smart_desc";

    // Lấy dữ liệu người dùng thật từ Supabase (auth.users + user_wallets + withdrawal_requests + cashback_orders)
    const { users: rawUsers, isRealData, orders } = await fetchRealAdminUsers();
    const stats = calculateKPIStats(rawUsers, orders);

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
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json(
        { error: "Không có quyền thực hiện thao tác này." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId, balance, pendingBalance, lockedBalance, bankName, bankAccountNo, bankAccountName, note } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "Thiếu thông tin userId cần cập nhật." },
        { status: 400 }
      );
    }

    for (const [label, val] of [
      ["Số dư khả dụng", balance],
      ["Tiền chờ duyệt", pendingBalance],
      ["Tiền đang khóa", lockedBalance],
    ] as const) {
      if (val !== undefined && (typeof val !== "number" || !Number.isFinite(val) || val < 0)) {
        return NextResponse.json(
          { error: `${label} phải là số không âm hợp lệ.` },
          { status: 400 }
        );
      }
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const adminEmail = auth.user?.email || "admin";

    let walletSaved = false;
    let metaSaved = false;
    let walletErrorMsg = "";
    let rpcWallet: Record<string, unknown> | null = null;

    if (supabaseAdmin) {
      const hasBalanceChange =
        typeof balance === "number" || typeof pendingBalance === "number" || typeof lockedBalance === "number";

      // 1A. Nếu có chỉnh số dư -> ưu tiên gọi RPC admin_adjust_wallet để ghi Sổ cái nguyên tử & kiểm tra mở khóa referral
      let adjustedViaRpc = false;
      if (hasBalanceChange) {
        try {
          const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("admin_adjust_wallet", {
            p_user_id: userId,
            p_new_balance: typeof balance === "number" ? Math.round(balance) : null,
            p_new_pending: typeof pendingBalance === "number" ? Math.round(pendingBalance) : null,
            p_new_locked: typeof lockedBalance === "number" ? Math.round(lockedBalance) : null,
            p_admin_email: adminEmail,
            p_note: typeof note === "string" && note.trim() ? note.trim() : "Admin điều chỉnh số dư ví",
          });
          if (!rpcErr && rpcData?.success) {
            adjustedViaRpc = true;
            walletSaved = true;
            if (rpcData.wallet && typeof rpcData.wallet === "object") {
              rpcWallet = rpcData.wallet as Record<string, unknown>;
            }
          } else if (
            rpcErr &&
            /negative_.*_not_allowed|invalid_user_id/i.test(rpcErr.message || "")
          ) {
            return NextResponse.json(
              { error: "Giá trị điều chỉnh số dư không hợp lệ (không được âm)." },
              { status: 400 }
            );
          }
        } catch (rpcCatch) {
          console.warn("admin_adjust_wallet RPC fallback:", rpcCatch);
        }
      }

      // 1B. Cập nhật thông tin ngân hàng (và số dư nếu RPC chưa cài)
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (!adjustedViaRpc) {
        if (typeof balance === "number") updateData.balance = balance;
        if (typeof pendingBalance === "number") updateData.pending_balance = pendingBalance;
        if (typeof lockedBalance === "number") updateData.locked_balance = lockedBalance;
      }
      if (typeof bankName === "string") updateData.bank_name = bankName;
      if (typeof bankAccountNo === "string") updateData.bank_account_no = bankAccountNo;
      if (typeof bankAccountName === "string") updateData.bank_account_name = bankAccountName;

      if (Object.keys(updateData).length > 1) {
        try {
          let prevWallet: { balance?: number; pending_balance?: number; locked_balance?: number } | null = null;
          if (!adjustedViaRpc && hasBalanceChange) {
            const { data: pw } = await supabaseAdmin
              .from("user_wallets")
              .select("balance, pending_balance, locked_balance")
              .eq("user_id", userId)
              .maybeSingle();
            prevWallet = pw;
          }

          const { error: upsertError } = await supabaseAdmin
            .from("user_wallets")
            .upsert(
              {
                user_id: userId,
                ...updateData,
              },
              { onConflict: "user_id" }
            );

          if (!upsertError) {
            walletSaved = true;
            if (!adjustedViaRpc && hasBalanceChange) {
              const dBal = typeof balance === "number" ? Math.round(balance) - Number(prevWallet?.balance || 0) : 0;
              const dPen =
                typeof pendingBalance === "number"
                  ? Math.round(pendingBalance) - Number(prevWallet?.pending_balance || 0)
                  : 0;
              const dLoc =
                typeof lockedBalance === "number"
                  ? Math.round(lockedBalance) - Number(prevWallet?.locked_balance || 0)
                  : 0;
              if (dBal !== 0 || dPen !== 0 || dLoc !== 0) {
                await appendWalletLedgerFallback({
                  userId,
                  entryType: "admin_adjustment",
                  deltaBalance: dBal,
                  deltaPending: dPen,
                  deltaLocked: dLoc,
                  referenceType: "admin_user_edit",
                  referenceId: userId,
                  actorType: "admin",
                  actorId: adminEmail,
                  note: typeof note === "string" && note.trim() ? note.trim() : "Admin điều chỉnh số dư ví",
                });
              }
            }
          } else {
            walletErrorMsg = upsertError.message;
            console.warn("user_wallets upsert warning:", upsertError.message);
          }
        } catch (wErr) {
          console.warn("user_wallets upsert catch error:", wErr);
        }
      }

      // 2. Đồng thời lưu trực tiếp vào user_metadata của auth.users qua Admin API
      // Đảm bảo số dư LUÔN ĐƯỢC LƯU VĨNH VIỄN trên Supabase dù bảng user_wallets chưa tạo
      try {
        if (supabaseAdmin.auth?.admin) {
          const metaUpdate: Record<string, unknown> = {};
          if (typeof balance === "number") metaUpdate.balance = balance;
          if (typeof pendingBalance === "number") metaUpdate.pending_balance = pendingBalance;
          if (typeof bankName === "string") metaUpdate.bank_name = bankName;
          if (typeof bankAccountNo === "string") metaUpdate.bank_account_no = bankAccountNo;
          if (typeof bankAccountName === "string") metaUpdate.bank_account_name = bankAccountName;

          const { error: metaErr } = await supabaseAdmin.auth.admin.updateUserById(
            userId,
            { user_metadata: metaUpdate }
          );

          if (!metaErr) {
            metaSaved = true;
          } else {
            console.warn("auth.admin.updateUserById warning:", metaErr.message);
          }
        }
      } catch (mErr) {
        console.warn("auth.admin.updateUserById error:", mErr);
      }
    }

    // 3. Cập nhật in-memory (phòng trường hợp là demo user)
    const updateInMemoryItem = (item: AdminUserItem) => {
      item.balance = typeof balance === "number" ? balance : item.balance;
      item.pendingBalance = typeof pendingBalance === "number" ? pendingBalance : item.pendingBalance;
      item.bankName = typeof bankName === "string" ? bankName : item.bankName;
      item.bankAccountNo = typeof bankAccountNo === "string" ? bankAccountNo : item.bankAccountNo;
      item.bankAccountName = typeof bankAccountName === "string" ? bankAccountName : item.bankAccountName;
      item.isBankConfigured = Boolean(
        (typeof bankAccountNo === "string" ? bankAccountNo : item.bankAccountNo) &&
        (typeof bankName === "string" ? bankName : item.bankName)
      );
    };

    const idx = inMemoryUsers.findIndex((u) => u.id === userId);
    if (idx !== -1) {
      updateInMemoryItem(inMemoryUsers[idx]);
    }
    const demoIdx = DEMO_ADMIN_USERS.findIndex((u) => u.id === userId);
    if (demoIdx !== -1) {
      updateInMemoryItem(DEMO_ADMIN_USERS[demoIdx]);
    }

    if (userId === "usr_dh_001" || userId === "demo-user" || userId === "demo-user-123") {
      updateSharedWallet({
        balance: typeof balance === "number" ? balance : undefined,
        pendingBalance: typeof pendingBalance === "number" ? pendingBalance : undefined,
        bankName: typeof bankName === "string" ? bankName : undefined,
        bankAccountNo: typeof bankAccountNo === "string" ? bankAccountNo : undefined,
        bankAccountName: typeof bankAccountName === "string" ? bankAccountName : undefined,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Cập nhật thông tin người dùng thành công.",
      walletSaved,
      metaSaved,
      wallet: rpcWallet,
      warning: !walletSaved && walletErrorMsg ? `Bảng user_wallets chưa nhận: ${walletErrorMsg}` : undefined,
      updatedUser: inMemoryUsers.find((u) => u.id === userId),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
