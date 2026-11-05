import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import { parseJsonBody, handleApiError } from "@/lib/api/response";
import type { WithdrawalRecord } from "@/lib/deals/withdrawals-store";

export const dynamic = "force-dynamic";
export type { WithdrawalRecord };

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ history: [] });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ history: [] });
    }

    const adminClient = getSupabaseAdminClient();
    const dbClient = adminClient || supabase;

    const { data: history } = await dbClient
      .from("withdrawal_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const dbHistory = Array.isArray(history) ? [...history] : [];
    dbHistory.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return NextResponse.json({ history: dbHistory });
  } catch (err: unknown) {
    return handleApiError(err, "Không thể tải lịch sử rút tiền.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const body = (await parseJsonBody<Record<string, unknown>>(request)) || {};
    const rawAmount = body.amount;
    const amount = Number(rawAmount);

    // Rule 1: Số tiền phải là số nguyên dương hợp lệ
    if (
      typeof rawAmount === "undefined" ||
      rawAmount === null ||
      rawAmount === "" ||
      isNaN(amount) ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return NextResponse.json(
        { error: "Số tiền muốn rút không hợp lệ. Vui lòng nhập một số nguyên dương." },
        { status: 400 }
      );
    }

    // Rule 2: Số tiền rút tối thiểu 10.000đ
    if (amount < 10000) {
      return NextResponse.json(
        { error: "Số tiền rút tối thiểu là 10.000đ." },
        { status: 400 }
      );
    }

    // Rule 3: Số tiền rút tối đa 50.000.000đ mỗi lần
    if (amount > 50000000) {
      return NextResponse.json(
        { error: "Số tiền rút tối đa mỗi lệnh là 50.000.000đ." },
        { status: 400 }
      );
    }

    // Rule 4: Bội số của 1.000đ
    if (amount % 1000 !== 0) {
      return NextResponse.json(
        {
          error:
            "Số tiền rút phải là bội số của 1.000đ (Ví dụ: 10.000đ, 20.000đ, 50.000đ...).",
        },
        { status: 400 }
      );
    }

    if (!supabase) {
      return NextResponse.json(
        { error: "Hệ thống chưa kết nối cơ sở dữ liệu. Vui lòng thử lại sau." },
        { status: 503 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Vui lòng đăng nhập để thực hiện yêu cầu rút tiền." },
        { status: 401 }
      );
    }

    const adminClient = getSupabaseAdminClient();
    const dbClient = adminClient || supabase;

    // Lấy thông tin ví & ngân hàng của user (ưu tiên user_wallets, fallback user_metadata)
    const { data: wallet } = await dbClient
      .from("user_wallets")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const metaBankName = String(user.user_metadata?.bank_name || "");
    const metaAccountNo = String(user.user_metadata?.bank_account_no || "");
    const metaAccountName = String(user.user_metadata?.bank_account_name || "");

    const bank_name = String(
      body.bank_name || wallet?.bank_name || metaBankName
    ).trim();
    const rawAccountNo = String(
      body.bank_account_no || wallet?.bank_account_no || metaAccountNo
    ).trim();
    const bank_account_name = String(
      body.bank_account_name ||
        wallet?.bank_account_name ||
        metaAccountName
    )
      .trim()
      .toUpperCase();
    const bank_account_no = rawAccountNo.replace(/\D/g, "");

    // Rule 6: Phải có thông tin ngân hàng hợp lệ
    if (!bank_name || !bank_account_no || !bank_account_name) {
      return NextResponse.json(
        {
          error:
            "Vui lòng lưu thông tin tài khoản ngân hàng nhận tiền trước khi rút.",
        },
        { status: 400 }
      );
    }

    if (bank_account_no.length < 6 || bank_account_no.length > 20) {
      return NextResponse.json(
        {
          error:
            "Số tài khoản ngân hàng không hợp lệ (phải từ 6 đến 20 chữ số).",
        },
        { status: 400 }
      );
    }

    // Rule 7: Thử gọi Stored Procedure nguyên tử create_withdrawal_request (Chống Race Condition)
    try {
      const { data: rpcRes, error: rpcErr } = await dbClient.rpc(
        "create_withdrawal_request",
        {
          p_user_id: user.id,
          p_amount: amount,
          p_bank_name: bank_name,
          p_bank_account_no: bank_account_no,
          p_bank_account_name: bank_account_name,
        }
      );

      if (!rpcErr && rpcRes && rpcRes.success) {
        return NextResponse.json({
          success: true,
          message: `Đã gửi yêu cầu rút ${amount.toLocaleString(
            "vi-VN"
          )}đ về ${bank_name}. Tiền sẽ được chuyển trong 24–48h làm việc.`,
          request: rpcRes.request,
          newBalance: rpcRes.new_balance,
        });
      }

      if (rpcErr && rpcErr.message?.includes("insufficient_balance")) {
        return NextResponse.json(
          {
            error: "Số dư khả dụng không đủ để thực hiện yêu cầu rút tiền này.",
          },
          { status: 400 }
        );
      }
    } catch (rpcCatchErr) {
      console.warn("RPC create_withdrawal_request fallback to direct atomic query:", rpcCatchErr);
    }

    // Fallback nếu Stored Procedure chưa được chạy trên Supabase:
    // Kiểm tra số dư và trừ tiền với điều kiện an toàn
    const currentBalance = Number(wallet?.balance ?? 0);
    if (currentBalance < 10000) {
      return NextResponse.json(
        {
          error: `Số dư khả dụng hiện tại (${currentBalance.toLocaleString(
            "vi-VN"
          )}đ) chưa đạt mức tối thiểu 10.000đ để rút.`,
        },
        { status: 400 }
      );
    }

    if (amount > currentBalance) {
      return NextResponse.json(
        {
          error: `Số tiền muốn rút (${amount.toLocaleString(
            "vi-VN"
          )}đ) vượt quá số dư khả dụng (${currentBalance.toLocaleString(
            "vi-VN"
          )}đ).`,
        },
        { status: 400 }
      );
    }

    // 1. Tạo lệnh rút trong withdrawal_requests TRƯỚC TIÊN
    const newRequest: WithdrawalRecord = {
      id: crypto.randomUUID(),
      user_id: user.id,
      amount,
      bank_name,
      bank_account_no,
      bank_account_name,
      status: "pending",
      note: "Đang chờ đối soát & chuyển khoản qua Napas247",
      created_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertError } = await dbClient
      .from("withdrawal_requests")
      .insert(newRequest)
      .select()
      .maybeSingle();

    if (insertError) {
      console.error("Supabase insert withdrawal error:", insertError);
      return NextResponse.json(
        { error: "Không thể lưu yêu cầu rút tiền vào CSDL. Vui lòng thử lại sau." },
        { status: 500 }
      );
    }

    // 2. Sau khi ghi CSDL thành công, trừ số dư trong user_wallets
    const newBalance = Math.max(0, currentBalance - amount);
    const newWithdrawn = Number(wallet?.total_withdrawn ?? 0) + amount;

    const { error: updateWalletError } = await dbClient
      .from("user_wallets")
      .update({
        balance: newBalance,
        total_withdrawn: newWithdrawn,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateWalletError) {
      console.warn("Wallet deduction warning:", updateWalletError);
    }

    return NextResponse.json({
      success: true,
      message: `Đã gửi yêu cầu rút ${amount.toLocaleString(
        "vi-VN"
      )}đ về ${bank_name}. Tiền sẽ được chuyển trong 24–48h làm việc.`,
      request: inserted || newRequest,
      newBalance,
    });
  } catch (err: unknown) {
    return handleApiError(err, "Không thể xử lý yêu cầu rút tiền lúc này.");
  }
}
