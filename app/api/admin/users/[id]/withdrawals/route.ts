import { NextRequest, NextResponse, after } from "next/server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyUserWithdrawalApproved } from "@/lib/email/withdrawal-notification";
import { appendWalletLedgerFallback } from "@/lib/referral/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json(
        { error: "Không có quyền truy cập danh sách yêu cầu rút tiền." },
        { status: 403 }
      );
    }

    const { id: userId } = await context.params;

    const supabaseAdmin = getSupabaseAdminClient();
    let supabaseServer: any = null;
    try {
      supabaseServer = await createSupabaseServerClient();
    } catch {}
    const clientToUse = supabaseAdmin || supabaseServer;

    let dbData: any[] = [];
    if (clientToUse) {
      const { data, error } = await clientToUse
        .from("withdrawal_requests")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        dbData = data;
      }
    }

    return NextResponse.json({ withdrawals: dbData });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json(
        { error: "Không có quyền cập nhật trạng thái yêu cầu rút tiền." },
        { status: 403 }
      );
    }

    const { id: userId } = await context.params;
    const body = await request.json();
    const { withdrawalId, status, note } = body;

    if (!withdrawalId || !status || !["completed", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Thiếu withdrawalId hoặc status không hợp lệ." },
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

    const finalNote = note || (status === "completed" ? "" : "Từ chối yêu cầu rút");
    const adminActorId = auth.user?.email || "admin";

    // Xác minh lệnh rút thuộc đúng userId trong route
    const { data: ownerCheck } = await clientToUse
      .from("withdrawal_requests")
      .select("user_id")
      .eq("id", withdrawalId)
      .maybeSingle();
    if (ownerCheck && ownerCheck.user_id && String(ownerCheck.user_id) !== userId) {
      return NextResponse.json(
        { error: "Lệnh rút tiền không thuộc về người dùng này." },
        { status: 400 }
      );
    }

    // 1. Thử gọi RPC nguyên tử process_withdrawal_decision (chống replay refund + ghi rõ actor_id thật của Admin)
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
          const notifyPromise = notifyUserWithdrawalApproved(clientToUse, withdrawalId, { user_id: userId, note: finalNote }).catch((err) =>
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
      console.warn("RPC process_withdrawal_decision fallback in user withdrawals:", rpcCatchErr);
    }

    // 2. Fallback nếu Stored Procedure chưa có trên DB: kiểm tra trạng thái pending
    const { data: wRow } = await clientToUse
      .from("withdrawal_requests")
      .select("user_id, amount, status, bank_name, bank_account_no, bank_account_name")
      .eq("id", withdrawalId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!wRow) {
      return NextResponse.json(
        { error: "Không tìm thấy thông tin lệnh rút tiền." },
        { status: 404 }
      );
    }

    if (wRow.status !== "pending") {
      return NextResponse.json(
        { error: `Lệnh rút tiền này đã ở trạng thái "${wRow.status}", không thể xử lý lại.` },
        { status: 400 }
      );
    }

    const targetAmount = Number(wRow.amount || 0);
    const targetUserId = String(wRow.user_id || userId);

    const { data: transitionedWr, error: updateErr } = await clientToUse
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

    if (updateErr) {
      console.error("DB update withdrawal error:", updateErr);
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

    // Hoàn trả số dư ví nếu từ chối (chỉ 1 lần duy nhất từ pending)
    if (status === "rejected" && targetAmount > 0 && targetUserId) {
      try {
        const { data: wallet } = await clientToUse
          .from("user_wallets")
          .select("balance, total_withdrawn")
          .eq("user_id", targetUserId)
          .maybeSingle();

        if (wallet) {
          const currentTotalW = Number(wallet.total_withdrawn || 0);
          const actualWithdrawnDeduct = Math.min(currentTotalW, targetAmount);

          await clientToUse
            .from("user_wallets")
            .update({
              balance: Number(wallet.balance || 0) + targetAmount,
              total_withdrawn: currentTotalW - actualWithdrawnDeduct,
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
              bank_name: wRow.bank_name,
              bank_account_no: wRow.bank_account_no,
            },
          });
        }
      } catch (err) {
        console.warn("Failed refund in user withdrawal patch:", err);
      }
    }

    // Nếu DUYỆT (completed): Ghi Sổ cái + Gửi email thông báo rút tiền thành công cho user
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
          bank_name: wRow.bank_name,
          bank_account_no: wRow.bank_account_no,
        },
      });
      const notifyPromise = notifyUserWithdrawalApproved(clientToUse, withdrawalId, {
        user_id: targetUserId,
        amount: targetAmount,
        bank_name: wRow.bank_name,
        bank_account_no: wRow.bank_account_no,
        bank_account_name: wRow.bank_account_name,
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
      message: `Đã cập nhật trạng thái yêu cầu rút tiền: ${status}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
