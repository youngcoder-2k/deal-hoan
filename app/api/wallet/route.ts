import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getSharedWallet,
  updateSharedWallet,
} from "@/lib/deals/user-wallet-store";
import { getSupabaseAdminClient } from "@/lib/auth/admin";

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
          history: [],
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
          history: [],
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
      const cleanHex = user.id.replace(/-/g, "").toLowerCase();
      const adminClient = getSupabaseAdminClient();

      const [walletRes, confirmedRes, claimsRes, historyRes] = await Promise.all([
        supabase.from("user_wallets").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("cashback_orders").select("*").or(`user_id.eq.${user.id},sub_id.ilike.%${cleanHex}%`).order("ordered_at", { ascending: false }),
        supabase.from("cashback_order_claims").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("withdrawal_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);

      let wallet = walletRes.data;
      if (!wallet && adminClient) {
        try {
          const { data: aWallet } = await adminClient.from("user_wallets").select("*").eq("user_id", user.id).maybeSingle();
          if (aWallet) wallet = aWallet;
        } catch {}
      }

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
        const clientForInsert = adminClient || supabase;
        void clientForInsert.from("user_wallets").insert({ user_id: user.id, ...mergedWallet }).then(null, () => {});
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

      let verified = confirmedRes.data || [];
      if (verified.length === 0 && adminClient) {
        try {
          const { data: aOrders } = await adminClient
            .from("cashback_orders")
            .select("*")
            .or(`user_id.eq.${user.id},sub_id.ilike.%${cleanHex}%`)
            .order("ordered_at", { ascending: false });
          if (aOrders && aOrders.length > 0) verified = aOrders;
        } catch {}
      }

      // Tự động tính toán số dư chờ duyệt từ các đơn pending và đồng bộ vào ví nếu thiếu
      const computedPending = verified
        .filter((o) => o.status === "pending")
        .reduce((sum, o) => sum + Number(o.cashback_amount || 0), 0);

      if (computedPending > mergedWallet.pending_balance) {
        mergedWallet.pending_balance = computedPending;
        const clientForUpdate = adminClient || supabase;
        void clientForUpdate
          .from("user_wallets")
          .update({ pending_balance: computedPending, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
      }

      const keys = new Set(verified.map(order => `${order.platform}:${order.order_id}`));
      const claims = (claimsRes.data || []).filter(claim => !keys.has(`${claim.platform}:${claim.order_id}`)).map(claim => ({
        ...claim, status: "pending", cashback_amount: 0, commission_amount: 0, ordered_at: claim.created_at,
        note: "Yêu cầu tra cứu — chưa có xác nhận và hoa hồng từ sàn.",
      }));

      const orders = [...verified, ...claims].sort((a,b) => Date.parse(b.ordered_at)-Date.parse(a.ordered_at));

      const dbHistory = Array.isArray(historyRes.data) ? [...historyRes.data] : [];
      dbHistory.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const history = dbHistory;

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
