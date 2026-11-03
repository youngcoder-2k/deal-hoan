import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import {
  checkAdminApiAuth,
  fetchRealAdminUsers,
} from "@/lib/auth/admin-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getWithdrawals,
  updateWithdrawalStatus,
} from "@/lib/deals/withdrawals-store";

export const dynamic = "force-dynamic";

export interface AdminWithdrawalItem {
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

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json(
        { error: "Không có quyền truy cập danh sách rút tiền." },
        { status: 403 }
      );
    }

    const supabaseAdmin = getSupabaseAdminClient();
    let supabaseServer: any = null;
    try {
      supabaseServer = await createSupabaseServerClient();
    } catch (err) {
      console.warn("createSupabaseServerClient error in withdrawals GET:", err);
    }
    const clientToUse = supabaseAdmin || supabaseServer;

    let dbWithdrawals: any[] = [];

    if (clientToUse) {
      // 1. Thử lấy từ bảng withdrawal_requests
      try {
        const { data, error } = await clientToUse
          .from("withdrawal_requests")
          .select("*")
          .order("created_at", { ascending: false });
        if (!error && Array.isArray(data) && data.length > 0) {
          dbWithdrawals = data;
        }
      } catch (err) {
        console.warn("withdrawal_requests query error:", err);
      }

      // 2. Nếu bảng trực tiếp chưa có dữ liệu, thử view admin_withdrawals_overview
      if (dbWithdrawals.length === 0) {
        try {
          const { data: ovData, error: ovErr } = await clientToUse
            .from("admin_withdrawals_overview")
            .select("*")
            .order("created_at", { ascending: false });
          if (!ovErr && Array.isArray(ovData) && ovData.length > 0) {
            dbWithdrawals = ovData;
          }
        } catch {}
      }
    }

    // 3. Kết hợp thêm in-memory store
    const memList = getWithdrawals();
    const existingIds = new Set(dbWithdrawals.map((w) => String(w.id)));
    for (const mw of memList) {
      if (!existingIds.has(String(mw.id))) {
        dbWithdrawals.push(mw);
        existingIds.add(String(mw.id));
      }
    }

    // 4. Lấy thông tin người dùng để join email/tên/refCode
    const { users } = await fetchRealAdminUsers();
    const userMap = new Map(users.map((u) => [u.id, u]));

    const formattedList: AdminWithdrawalItem[] = dbWithdrawals.map((item: any) => {
      const uid = String(item.user_id || "");
      const matchedUser = userMap.get(uid);

      return {
        id: String(item.id),
        userId: uid,
        userEmail: String(
          item.user_email || matchedUser?.email || "user@dealhoan.vn"
        ),
        userName: String(
          item.user_name ||
            matchedUser?.fullName ||
            matchedUser?.bankAccountName ||
            item.bank_account_name ||
            "Người dùng"
        ),
        userRefCode: matchedUser?.refCode || `u_${uid.slice(0, 8)}`,
        amount: Number(item.amount || 0),
        bankName: String(item.bank_name || matchedUser?.bankName || "MB Bank"),
        bankAccountNo: String(
          item.bank_account_no || matchedUser?.bankAccountNo || ""
        ),
        bankAccountName: String(
          item.bank_account_name ||
            matchedUser?.bankAccountName ||
            matchedUser?.fullName ||
            ""
        ).toUpperCase(),
        status: (item.status || "pending") as
          | "pending"
          | "completed"
          | "rejected",
        note: item.note ? String(item.note) : null,
        createdAt: String(item.created_at || new Date().toISOString()),
        updatedAt: item.updated_at ? String(item.updated_at) : undefined,
      };
    });

    // Sắp xếp: Ưu tiên các lệnh 'pending' lên hàng đầu để Admin duyệt ngay,
    // sau đó sắp xếp theo thời gian mới nhất
    formattedList.sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });

    return NextResponse.json({ withdrawals: formattedList });
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
        { error: "Không có quyền duyệt yêu cầu rút tiền." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { withdrawalId, status, note } = body;

    if (!withdrawalId || !status || !["completed", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Thiếu withdrawalId hoặc status không hợp lệ ('completed' hoặc 'rejected')." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdminClient();
    let supabaseServer: any = null;
    try {
      supabaseServer = await createSupabaseServerClient();
    } catch {}
    const clientToUse = supabaseAdmin || supabaseServer;

    const defaultNote =
      status === "completed"
        ? "Đã chuyển khoản Napas247 thành công"
        : "Thông tin tài khoản ngân hàng chưa chính xác";
    const finalNote = typeof note === "string" && note.trim() ? note.trim() : defaultNote;

    // 1. Cập nhật trong cơ sở dữ liệu Supabase nếu có client
    let targetUserId = "";
    let targetAmount = 0;

    if (clientToUse) {
      try {
        const { data: currentWr } = await clientToUse
          .from("withdrawal_requests")
          .select("user_id, amount, status")
          .eq("id", withdrawalId)
          .maybeSingle();

        if (currentWr) {
          targetUserId = String(currentWr.user_id);
          targetAmount = Number(currentWr.amount || 0);
        }

        await clientToUse
          .from("withdrawal_requests")
          .update({
            status,
            note: finalNote,
            updated_at: new Date().toISOString(),
          })
          .eq("id", withdrawalId);
      } catch (err) {
        console.warn("Error updating withdrawal_requests in DB:", err);
      }
    }

    // 2. Tìm thông tin từ in-memory store nếu chưa lấy được target
    if (!targetUserId) {
      const memTarget = getWithdrawals().find((w) => w.id === withdrawalId);
      if (memTarget) {
        targetUserId = memTarget.user_id;
        targetAmount = memTarget.amount;
      }
    }

    // 3. Cập nhật in-memory store
    updateWithdrawalStatus(withdrawalId, status, finalNote);

    // 4. Nếu TỪ CHỐI (rejected), tự động hoàn tiền lại vào số dư ví của người dùng
    if (status === "rejected" && targetUserId && targetAmount > 0 && clientToUse) {
      try {
        const { data: walletData } = await clientToUse
          .from("user_wallets")
          .select("balance, total_withdrawn")
          .eq("user_id", targetUserId)
          .maybeSingle();

        if (walletData) {
          const currentBal = Number(walletData.balance || 0);
          const currentTotalW = Number(walletData.total_withdrawn || 0);
          const newBal = currentBal + targetAmount;
          const newTotalW = Math.max(0, currentTotalW - targetAmount);

          await clientToUse
            .from("user_wallets")
            .update({
              balance: newBal,
              total_withdrawn: newTotalW,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", targetUserId);
        }
      } catch (refundErr) {
        console.warn("Failed to refund wallet balance on rejection:", refundErr);
      }
    }

    return NextResponse.json({
      success: true,
      message:
        status === "completed"
          ? "✅ Đã duyệt và xác nhận chuyển tiền thành công!"
          : "❌ Đã từ chối lệnh rút tiền và hoàn tiền về ví người dùng.",
      withdrawalId,
      status,
      note: finalNote,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
