import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

    let targetAmount = 0;

    const { data: wRow } = await clientToUse
      .from("withdrawal_requests")
      .select("amount")
      .eq("id", withdrawalId)
      .maybeSingle();

    if (wRow) {
      targetAmount = Number(wRow.amount || 0);
    }

    const { error: updateErr } = await clientToUse
      .from("withdrawal_requests")
      .update({
        status,
        note: note || (status === "completed" ? "Đã chuyển khoản Napas247" : "Từ chối yêu cầu rút"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawalId);

    if (updateErr) {
      console.warn("DB update withdrawal error:", updateErr);
    }

    // Hoàn trả số dư ví nếu từ chối
    if (status === "rejected" && targetAmount > 0 && userId) {
      try {
        const { data: wallet } = await clientToUse
          .from("user_wallets")
          .select("balance, total_withdrawn")
          .eq("user_id", userId)
          .maybeSingle();

        if (wallet) {
          await clientToUse
            .from("user_wallets")
            .update({
              balance: Number(wallet.balance || 0) + targetAmount,
              total_withdrawn: Math.max(0, Number(wallet.total_withdrawn || 0) - targetAmount),
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        }
      } catch (err) {
        console.warn("Failed refund in user withdrawal patch:", err);
      }
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
