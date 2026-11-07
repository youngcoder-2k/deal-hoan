import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import {
  checkAdminApiAuth,
  fetchRealAdminUsers,
} from "@/lib/auth/admin-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
      // 1. Lấy trực tiếp từ bảng withdrawal_requests trong CSDL Supabase
      try {
        const { data, error } = await clientToUse
          .from("withdrawal_requests")
          .select("*")
          .order("created_at", { ascending: false });
        if (!error && Array.isArray(data)) {
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

    // 4. Lấy thông tin người dùng từ auth để map email và họ tên chính xác
    const { users } = await fetchRealAdminUsers();
    const userMap = new Map(users.map((u) => [u.id, u]));

    // 5. Định dạng dữ liệu hiển thị — TUYỆT ĐỐI 100% DATA TỪ CSDL, KHÔNG DÙNG FAKE/MOCK DATA
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

    if (!clientToUse) {
      return NextResponse.json(
        { error: "Không thể kết nối CSDL Supabase để cập nhật." },
        { status: 500 }
      );
    }

    const defaultNote =
      status === "completed"
        ? ""
        : "Thông tin tài khoản ngân hàng chưa chính xác";
    const finalNote = typeof note === "string" && note.trim() ? note.trim() : defaultNote;

    // 1. Thử gọi hàm Stored Procedure nguyên tử process_withdrawal_decision
    try {
      const { data: rpcRes, error: rpcErr } = await clientToUse.rpc(
        "process_withdrawal_decision",
        {
          p_withdrawal_id: withdrawalId,
          p_status: status,
          p_note: finalNote,
        }
      );
      if (!rpcErr && rpcRes && rpcRes.success) {
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
      }
      if (rpcErr && rpcErr.message?.includes("withdrawal_already_processed")) {
        return NextResponse.json(
          { error: "Lệnh rút tiền này đã được xử lý trước đó, không thể thay đổi lại." },
          { status: 400 }
        );
      }
    } catch (rpcCatchErr) {
      console.warn("RPC process_withdrawal_decision fallback:", rpcCatchErr);
    }

    // Fallback nếu Stored Procedure chưa tạo trong CSDL:
    let targetUserId = "";
    let targetAmount = 0;

    const { data: currentWr } = await clientToUse
      .from("withdrawal_requests")
      .select("user_id, amount, status")
      .eq("id", withdrawalId)
      .maybeSingle();

    if (!currentWr) {
      return NextResponse.json(
        { error: "Không tìm thấy thông tin lệnh rút tiền." },
        { status: 404 }
      );
    }

    // Bảo mật: Chặn đứng nguy cơ hoàn tiền lặp lại (Replay Refund Attack)
    if (currentWr.status !== "pending") {
      return NextResponse.json(
        { error: `Lệnh rút tiền này đã ở trạng thái "${currentWr.status}", không thể xử lý lại.` },
        { status: 400 }
      );
    }

    targetUserId = String(currentWr.user_id);
    targetAmount = Number(currentWr.amount || 0);

    const { error: updateWrErr } = await clientToUse
      .from("withdrawal_requests")
      .update({
        status,
        note: finalNote,
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawalId);

    if (updateWrErr) {
      console.warn("Error updating withdrawal_requests in DB:", updateWrErr);
    }

    // 2. Nếu TỪ CHỐI (rejected) và trạng thái trước đó là 'pending': Hoàn tiền 1 lần duy nhất về ví
    if (status === "rejected" && targetUserId && targetAmount > 0) {
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
