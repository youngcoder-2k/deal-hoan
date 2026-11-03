import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getSharedWallet,
  updateSharedWallet,
} from "@/lib/deals/user-wallet-store";
import { getWithdrawals } from "@/lib/deals/withdrawals-store";

export const dynamic = "force-dynamic";

export interface WalletData {
  balance: number;
  pending_balance: number;
  total_withdrawn: number;
  bank_name: string;
  bank_account_no: string;
  bank_account_name: string;
}

export async function GET(request: NextRequest) {
  try {
    const isFull = request.nextUrl.searchParams.get("full") === "1";
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      const sw = getSharedWallet();
      const fallbackWallet = {
        balance: sw.balance,
        pending_balance: sw.pendingBalance,
        total_withdrawn: sw.totalWithdrawn,
        bank_name: sw.bankName,
        bank_account_no: sw.bankAccountNo,
        bank_account_name: sw.bankAccountName,
      };
      if (isFull) {
        return NextResponse.json({
          wallet: fallbackWallet,
          orders: [],
          history: getWithdrawals("usr_dh_001"),
        });
      }
      return NextResponse.json({
        wallet: fallbackWallet,
      });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      const sw = getSharedWallet();
      const fallbackWallet = {
        balance: sw.balance,
        pending_balance: sw.pendingBalance,
        total_withdrawn: sw.totalWithdrawn,
        bank_name: sw.bankName,
        bank_account_no: sw.bankAccountNo,
        bank_account_name: sw.bankAccountName,
      };
      if (isFull) {
        return NextResponse.json({
          wallet: fallbackWallet,
          orders: [],
          history: getWithdrawals("usr_dh_001"),
        });
      }
      return NextResponse.json({
        wallet: fallbackWallet,
      });
    }

    const metaBankName = String(user.user_metadata?.bank_name || "");
    const metaAccountNo = String(user.user_metadata?.bank_account_no || "");
    const metaAccountName = String(user.user_metadata?.bank_account_name || "");

    if (isFull) {
      const [walletRes, confirmedRes, claimsRes, sessionsRes, historyRes] = await Promise.all([
        supabase.from("user_wallets").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("cashback_orders").select("*").eq("user_id", user.id).order("ordered_at", { ascending: false }),
        supabase.from("cashback_order_claims").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("shopping_sessions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("withdrawal_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);

      const wallet = walletRes.data;
      let mergedWallet: WalletData;
      if (!wallet) {
        mergedWallet = {
          balance: 0,
          pending_balance: 0,
          total_withdrawn: 0,
          bank_name: metaBankName,
          bank_account_no: metaAccountNo,
          bank_account_name: metaAccountName,
        };
        void supabase.from("user_wallets").insert({ user_id: user.id, ...mergedWallet }).then(null, () => {});
      } else {
        mergedWallet = {
          balance: Number(wallet.balance ?? 0),
          pending_balance: Number(wallet.pending_balance ?? 0),
          total_withdrawn: Number(wallet.total_withdrawn ?? 0),
          bank_name: wallet.bank_name || metaBankName,
          bank_account_no: wallet.bank_account_no || metaAccountNo,
          bank_account_name: wallet.bank_account_name || metaAccountName,
        };
      }

      const verified = confirmedRes.data || [];
      const keys = new Set(verified.map(order => `${order.platform}:${order.order_id}`));
      const claims = (claimsRes.data || []).filter(claim => !keys.has(`${claim.platform}:${claim.order_id}`)).map(claim => ({
        ...claim, status: "pending", cashback_amount: 0, commission_amount: 0, ordered_at: claim.created_at,
        note: "Yêu cầu tra cứu — chưa có xác nhận và hoa hồng từ sàn.",
      }));

      // Lọc các shopping sessions từ máy chủ CSDL chưa có đơn thật đối ứng
      const rawSessions = (sessionsRes.data || []).map((s: Record<string, unknown>) => ({
        id: String(s.id),
        user_id: String(s.user_id),
        order_id: String(s.order_id || "ĐANG-CHỜ-SÀN"),
        platform: String(s.platform || "Shopee") as "Shopee" | "ShopeeFood" | "TikTok Shop" | "Lazada",
        product_name: String(s.product_name || "Sản phẩm mua qua DealHoàn"),
        product_image: s.product_image ? String(s.product_image) : null,
        order_value: Number(s.order_value) || 0,
        cashback_amount: Number(s.cashback_amount) || 0,
        status: (s.status || "tracking") as "tracking" | "pending" | "completed" | "rejected",
        note: String(s.note || "Đã chuyển sang sàn mua hàng · Đang chờ sàn đối soát và gửi đơn (15–45 phút)."),
        ordered_at: String(s.created_at || new Date().toISOString()),
        is_tracking_session: true,
      }));

      const activeSessions = rawSessions.filter((sess) => {
        const sessTime = new Date(sess.ordered_at).getTime();
        return !verified.some((ord) => ord.platform === sess.platform && Math.abs(new Date(ord.ordered_at).getTime() - sessTime) < 2 * 3600 * 1000);
      });

      const orders = [...verified, ...claims, ...activeSessions].sort((a,b) => Date.parse(b.ordered_at)-Date.parse(a.ordered_at));

      const history = (historyRes.data && historyRes.data.length > 0) ? historyRes.data : getWithdrawals(user.id);

      return NextResponse.json({
        wallet: mergedWallet,
        orders,
        history,
      });
    }

    const { data: wallet, error: dbError } = await supabase
      .from("user_wallets")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (dbError) {
      console.warn("user_wallets query fallback:", dbError.message);
      return NextResponse.json({
        wallet: {
          balance: 0,
          pending_balance: 0,
          total_withdrawn: 0,
          bank_name: metaBankName,
          bank_account_no: metaAccountNo,
          bank_account_name: metaAccountName,
        },
      });
    }

    if (!wallet) {
      const initialWallet = {
        user_id: user.id,
        balance: 0,
        pending_balance: 0,
        total_withdrawn: 0,
        bank_name: metaBankName,
        bank_account_no: metaAccountNo,
        bank_account_name: metaAccountName,
      };
      await supabase.from("user_wallets").insert(initialWallet);
      return NextResponse.json({ wallet: initialWallet });
    }

    // Merge with user_metadata if user_wallets has empty bank fields
    const mergedWallet: WalletData = {
      balance: Number(wallet.balance ?? 0),
      pending_balance: Number(wallet.pending_balance ?? 0),
      total_withdrawn: Number(wallet.total_withdrawn ?? 0),
      bank_name: wallet.bank_name || metaBankName,
      bank_account_no: wallet.bank_account_no || metaAccountNo,
      bank_account_name: wallet.bank_account_name || metaAccountName,
    };

    return NextResponse.json({ wallet: mergedWallet });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const body = await request.json();
    const bank_name = String(body.bank_name || "").trim();
    const rawAccountNo = String(body.bank_account_no || "").trim();
    const bank_account_name = String(body.bank_account_name || "").trim().toUpperCase();

    // 1. Kiểm tra không để trống
    if (!bank_name || !rawAccountNo || !bank_account_name) {
      return NextResponse.json(
        { error: "Vui lòng nhập đầy đủ Ngân hàng, Số tài khoản và Tên chủ tài khoản." },
        { status: 400 }
      );
    }

    // 2. Validate số tài khoản: chỉ số, độ dài 6-20 ký tự
    const cleanAccountNo = rawAccountNo.replace(/\D/g, "");
    if (cleanAccountNo.length < 6 || cleanAccountNo.length > 20) {
      return NextResponse.json(
        { error: "Số tài khoản ngân hàng không hợp lệ (phải từ 6 đến 20 chữ số)." },
        { status: 400 }
      );
    }

    // 3. Validate tên chủ tài khoản: tối thiểu 3 chữ cái, không chứa số/ký tự đặc biệt
    if (bank_account_name.length < 3 || /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(bank_account_name)) {
      return NextResponse.json(
        { error: "Tên chủ tài khoản không hợp lệ (tối thiểu 3 chữ cái, không chứa số hoặc ký tự đặc biệt)." },
        { status: 400 }
      );
    }

    if (!supabase) {
      const sw = updateSharedWallet({
        bankName: bank_name,
        bankAccountNo: cleanAccountNo,
        bankAccountName: bank_account_name,
      });
      return NextResponse.json({
        success: true,
        wallet: {
          balance: sw.balance,
          pending_balance: sw.pendingBalance,
          total_withdrawn: sw.totalWithdrawn,
          bank_name: sw.bankName,
          bank_account_no: sw.bankAccountNo,
          bank_account_name: sw.bankAccountName,
        },
      });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    // A. Lưu vào Supabase Auth user_metadata để đảm bảo luôn luôn tồn tại
    try {
      await supabase.auth.updateUser({
        data: {
          bank_name,
          bank_account_no: cleanAccountNo,
          bank_account_name,
        },
      });
    } catch (metaErr) {
      console.warn("Update user_metadata error:", metaErr);
    }

    // B. Đồng thời lưu vào bảng user_wallets
    const { data: updatedWallet, error: upsertError } = await supabase
      .from("user_wallets")
      .upsert(
        {
          user_id: user.id,
          bank_name,
          bank_account_no: cleanAccountNo,
          bank_account_name,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .maybeSingle();

    if (upsertError) {
      console.warn("user_wallets update fallback:", upsertError.message);
    }

    return NextResponse.json({
      success: true,
      wallet: {
        balance: Number(updatedWallet?.balance ?? 0),
        pending_balance: Number(updatedWallet?.pending_balance ?? 0),
        total_withdrawn: Number(updatedWallet?.total_withdrawn ?? 0),
        bank_name,
        bank_account_no: cleanAccountNo,
        bank_account_name,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
