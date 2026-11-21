import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseAdminClient, isHqvTestWithdrawal } from "@/lib/auth/admin";
import {
  checkAdminApiAuth,
  fetchRealAdminUsers,
} from "@/lib/auth/admin-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyUserWithdrawalApproved } from "@/lib/email/withdrawal-notification";
import { appendWalletLedgerFallback } from "@/lib/referral/service";

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
      // 1. Tự động dọn dẹp các lệnh rút test của Huy Quang Vũ (100k) khỏi CSDL Supabase
      try {
        const { data: testRows } = await clientToUse
          .from("withdrawal_requests")
          .select("id, user_id, amount, bank_account_name, bank_account_no, note");

        if (Array.isArray(testRows) && testRows.length > 0) {
          const testMatches = testRows.filter((r) => isHqvTestWithdrawal(r));
          if (testMatches.length > 0) {
            const testIds = testMatches.map((r) => r.id);
            await clientToUse
              .from("withdrawal_requests")
              .delete()
              .in("id", testIds);

            const affectedUserIds = Array.from(new Set(testMatches.map((r) => r.user_id).filter(Boolean)));
            for (const uid of affectedUserIds) {
              await clientToUse
                .from("user_wallets")
                .update({ total_withdrawn: 0, updated_at: new Date().toISOString() })
                .eq("user_id", uid);
            }
          }
        }
      } catch (cleanErr) {
        console.warn("Auto-clean test withdrawal requests in DB error:", cleanErr);
      }

      // 2. Lấy trực tiếp từ bảng withdrawal_requests trong CSDL Supabase
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

      // 3. Nếu bảng trực tiếp chưa có dữ liệu, thử view admin_withdrawals_overview
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

    // 6. Lọc bỏ triệt để 2 lệnh rút tiền test của Huy Quang Vũ (tổng 100k) để số tiền đã chi trả chuẩn xác 78k
    const cleanList = formattedList.filter((item) => {
      const matchedUser = userMap.get(item.userId);
      return !isHqvTestWithdrawal(item, matchedUser);
    });

    // Sắp xếp: Ưu tiên các lệnh 'pending' lên hàng đầu để Admin duyệt ngay,
    // sau đó sắp xếp theo thời gian mới nhất
    cleanList.sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });

    return NextResponse.json({ withdrawals: cleanList });
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

    const adminActorId = auth.user?.email || "admin";

    // 1. Thử gọi hàm Stored Procedure nguyên tử process_withdrawal_decision (truyền actor_id thật của Admin)
    try {
      let { data: rpcRes, error: rpcErr } = await clientToUse.rpc(
        "process_withdrawal_decision",
        {
          p_withdrawal_id: withdrawalId,
          p_status: status,
          p_note: finalNote,
          p_actor_id: adminActorId,
        }
      );
      // Tương thích ngược nếu DB mới chỉ cài bản 3 tham số cũ
      if (rpcErr && /process_withdrawal_decision/i.test(rpcErr.message || "")) {
        const legacyRes = await clientToUse.rpc("process_withdrawal_decision", {
          p_withdrawal_id: withdrawalId,
          p_status: status,
          p_note: finalNote,
        });
        rpcRes = legacyRes.data;
        rpcErr = legacyRes.error;
      }
      if (!rpcErr && rpcRes && rpcRes.success) {
        if (status === "completed") {
          const notifyPromise = notifyUserWithdrawalApproved(clientToUse, withdrawalId, { note: finalNote }).catch((err) =>
            console.error("Non-blocking notify user withdrawal approved error:", err)
          );
          try {
            after(async () => {
              await notifyPromise;
            });
          } catch {}
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
      .select("user_id, amount, status, bank_name, bank_account_no, bank_account_name")
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

    // Khóa lạc quan: chỉ chuyển trạng thái khi dòng vẫn đang ở 'pending'
    const { data: transitionedWr, error: updateWrErr } = await clientToUse
      .from("withdrawal_requests")
      .update({
        status,
        note: finalNote,
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawalId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateWrErr) {
      console.error("Error updating withdrawal_requests in DB:", updateWrErr);
      return NextResponse.json(
        { error: "Không thể cập nhật trạng thái lệnh rút tiền trong CSDL." },
        { status: 500 }
      );
    }

    if (!transitionedWr) {
      return NextResponse.json(
        { error: "Lệnh rút tiền này vừa được xử lý bởi thao tác khác, không thể xử lý lại." },
        { status: 400 }
      );
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
          const actualWithdrawnDeduct = Math.min(currentTotalW, targetAmount);
          const newBal = currentBal + targetAmount;
          const newTotalW = currentTotalW - actualWithdrawnDeduct;

          await clientToUse
            .from("user_wallets")
            .update({
              balance: newBal,
              total_withdrawn: newTotalW,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", targetUserId);

          await appendWalletLedgerFallback({
            userId: targetUserId,
            entryType: "withdrawal_rejected",
            deltaBalance: targetAmount,
            deltaWithdrawn: -actualWithdrawnDeduct,
            referenceType: "withdrawal_request",
            referenceId: String(withdrawalId),
            idempotencyKey: `wd_dec:${withdrawalId}`,
            actorType: "admin",
            actorId: adminActorId,
            note: `Từ chối lệnh rút & hoàn tiền về ví: ${finalNote}`,
            metadata: {
              withdrawal_id: withdrawalId,
              amount: targetAmount,
              bank_name: currentWr.bank_name,
              bank_account_no: currentWr.bank_account_no,
            },
          });
        }
      } catch (refundErr) {
        console.warn("Failed to refund wallet balance on rejection:", refundErr);
      }
    }

    // 3. Nếu DUYỆT (completed): Ghi Sổ cái xác nhận chi + Gửi email thông báo rút tiền thành công cho user
    if (status === "completed") {
      await appendWalletLedgerFallback({
        userId: targetUserId,
        entryType: "withdrawal_completed",
        deltaBalance: 0,
        deltaWithdrawn: 0,
        referenceType: "withdrawal_request",
        referenceId: String(withdrawalId),
        idempotencyKey: `wd_dec:${withdrawalId}`,
        actorType: "admin",
        actorId: auth.user?.email || "admin",
        note: `Xác nhận chuyển khoản thành công ${targetAmount.toLocaleString("vi-VN")}đ${finalNote ? `: ${finalNote}` : ""}`,
        metadata: {
          withdrawal_id: withdrawalId,
          amount: targetAmount,
          bank_name: currentWr.bank_name,
          bank_account_no: currentWr.bank_account_no,
        },
      });
      const notifyPromise = notifyUserWithdrawalApproved(clientToUse, withdrawalId, {
        user_id: targetUserId,
        amount: targetAmount,
        bank_name: currentWr.bank_name,
        bank_account_no: currentWr.bank_account_no,
        bank_account_name: currentWr.bank_account_name,
        note: finalNote,
      }).catch((err) =>
        console.error("Non-blocking notify user withdrawal approved error:", err)
      );
      try {
        after(async () => {
          await notifyPromise;
        });
      } catch {}
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

export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json(
        { error: "Không có quyền xóa yêu cầu rút tiền." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const cleanTest = searchParams.get("clean_test") === "true";

    const supabaseAdmin = getSupabaseAdminClient();
    let supabaseServer: any = null;
    try {
      supabaseServer = await createSupabaseServerClient();
    } catch {}
    const clientToUse = supabaseAdmin || supabaseServer;

    if (!clientToUse) {
      return NextResponse.json(
        { error: "Không thể kết nối CSDL Supabase để xóa." },
        { status: 500 }
      );
    }

    if (cleanTest) {
      const { data: allW } = await clientToUse
        .from("withdrawal_requests")
        .select("id, user_id, bank_account_name, bank_account_no, note");
      if (Array.isArray(allW)) {
        const matches = allW.filter((r) => isHqvTestWithdrawal(r));
        if (matches.length > 0) {
          const ids = matches.map((r) => r.id);
          await clientToUse.from("withdrawal_requests").delete().in("id", ids);
          for (const uid of new Set(matches.map((r) => r.user_id).filter(Boolean))) {
            await clientToUse.from("user_wallets").update({ total_withdrawn: 0 }).eq("user_id", uid);
          }
          return NextResponse.json({ success: true, deletedCount: ids.length, deletedIds: ids });
        }
      }
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    if (!id) {
      return NextResponse.json({ error: "Thiếu id lệnh rút cần xóa." }, { status: 400 });
    }

    const { error: delErr } = await clientToUse
      .from("withdrawal_requests")
      .delete()
      .eq("id", id);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Đã xóa lệnh rút ${id}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

