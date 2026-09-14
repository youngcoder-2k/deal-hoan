import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

interface WithdrawalRecord {
  id: string;
  user_id: string;
  amount: number;
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
  status: "pending" | "completed" | "rejected";
  note?: string | null;
  created_at: string;
}

// In-memory withdrawal store for dev/demo mode
const inMemoryWithdrawals: WithdrawalRecord[] = [
  {
    id: "w-demo-1",
    user_id: "usr_dh_001",
    amount: 200000,
    bank_name: "MB Bank (MBB)",
    bank_account_no: "0988889999",
    bank_account_name: "NGUYEN VAN DEMO",
    status: "completed",
    note: "Đã chuyển khoản thành công qua Napas247",
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "w-demo-2",
    user_id: "usr_dh_002",
    amount: 300000,
    bank_name: "Techcombank (TCB)",
    bank_account_no: "1903456789102",
    bank_account_name: "TRAN VAN MINH",
    status: "pending",
    note: "Đang chờ admin đối soát đơn hoàn tiền",
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: "w-demo-3",
    user_id: "usr_dh_003",
    amount: 500000,
    bank_name: "Vietcombank (VCB)",
    bank_account_no: "0011004382910",
    bank_account_name: "NGUYEN LAN HUONG",
    status: "completed",
    note: "Đã chi trả Napas247",
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
  },
  {
    id: "w-demo-4",
    user_id: "usr_dh_005",
    amount: 100000,
    bank_name: "VPBank",
    bank_account_no: "128938472910",
    bank_account_name: "PHAM THUY DUONG",
    status: "rejected",
    note: "Số tài khoản nhận tiền bị sai tên chủ tài khoản",
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
  {
    id: "w-demo-5",
    user_id: "usr_dh_006",
    amount: 150000,
    bank_name: "ACB",
    bank_account_no: "248910283",
    bank_account_name: "NGUYEN DUC VIET",
    status: "completed",
    note: "Hoàn tất chuyển khoản",
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
  {
    id: "w-demo-6",
    user_id: "usr_dh_007",
    amount: 250000,
    bank_name: "TPBank",
    bank_account_no: "03928172601",
    bank_account_name: "LE MAI ANH",
    status: "pending",
    note: "Chờ duyệt Napas247",
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
];

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

      if (!error && data) {
        return NextResponse.json({ withdrawals: data });
      }
    }

    // Fallback to in-memory demo data
    const userWithdrawals = inMemoryWithdrawals.filter((w) => w.user_id === userId);
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

    const target = inMemoryWithdrawals.find((w) => w.id === withdrawalId);
    if (target) {
      target.status = status;
      if (typeof note === "string") target.note = note;
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
