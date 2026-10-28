import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import {
  getWithdrawals,
  updateWithdrawalStatus,
} from "@/lib/deals/withdrawals-store";

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

    if (supabaseAdmin && hasSupabaseConfig) {
      const { data, error } = await supabaseAdmin
        .from("withdrawal_requests")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!error && data && data.length > 0) {
        return NextResponse.json({ withdrawals: data });
      }
    }

    // Fallback to shared in-memory store
    const userWithdrawals = getWithdrawals(userId);
    return NextResponse.json({ withdrawals: userWithdrawals });
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

    await context.params;
    const body = await request.json();
    const { withdrawalId, status, note } = body;

    if (!withdrawalId || !status) {
      return NextResponse.json(
        { error: "Thiếu withdrawalId hoặc status." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdminClient();

    if (supabaseAdmin && hasSupabaseConfig) {
      await supabaseAdmin
        .from("withdrawal_requests")
        .update({
          status,
          note,
          updated_at: new Date().toISOString(),
        })
        .eq("id", withdrawalId);
    }

    updateWithdrawalStatus(withdrawalId, status, note);

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật trạng thái yêu cầu rút tiền: ${status}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
