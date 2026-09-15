import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import { recordCashbackOrder } from "@/lib/deals/cashback";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const status = searchParams.get("status");
    const userId = searchParams.get("userId");

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return NextResponse.json({ orders: [], total: 0 });
    }

    let query = supabaseAdmin
      .from("cashback_orders")
      .select("*")
      .order("ordered_at", { ascending: false });

    if (platform) query = query.eq("platform", platform);
    if (status) query = query.eq("status", status);
    if (userId) query = query.eq("user_id", userId);

    const { data: orders, error } = await query;

    if (error) {
      console.warn("admin orders fetch error:", error.message);
      return NextResponse.json({ orders: [], error: error.message });
    }

    return NextResponse.json({
      success: true,
      orders: orders || [],
      total: orders?.length || 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Admin tạo đơn hàng hoàn tiền thủ công hoặc mô phỏng đơn test
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền thực hiện." }, { status: 403 });
    }

    const body = await request.json();
    const {
      userId,
      orderId = `TEST_${Date.now().toString().slice(-8)}`,
      platform = "Shopee",
      productName = "Đơn hàng thử nghiệm DealHoàn",
      orderValue = 250000,
      commissionAmount = 25000,
      cashbackAmount = 25000,
      status = "pending",
      note = "Đơn test do Admin tạo",
    } = body;

    if (!userId) {
      return NextResponse.json({ error: "Thiếu userId để tạo đơn hoàn tiền." }, { status: 400 });
    }

    const result = await recordCashbackOrder({
      userId,
      orderId,
      platform,
      productName,
      orderValue: Number(orderValue),
      commissionAmount: Number(commissionAmount),
      cashbackAmount: Number(cashbackAmount),
      status,
      note,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Đã tạo đơn hàng hoàn tiền thành công!",
      order: result.order,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Admin duyệt (completed) hoặc từ chối (rejected) đơn hàng
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền thực hiện." }, { status: 403 });
    }

    const body = await request.json();
    const { orderId, platform = "Shopee", status, note } = body;

    if (!orderId || !status) {
      return NextResponse.json({ error: "Thiếu orderId hoặc status cần cập nhật." }, { status: 400 });
    }

    const result = await recordCashbackOrder({
      orderId,
      platform,
      orderValue: 0, // Sẽ giữ nguyên giá trị đơn hiện có trong DB
      status,
      note: note || `Admin cập nhật trạng thái sang ${status}`,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Đã cập nhật đơn sang trạng thái ${status}!`,
      order: result.order,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
