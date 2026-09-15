import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserCashbackOrders, recordCashbackOrder } from "@/lib/deals/cashback";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    let currentUserId = "demo-user-123";

    if (supabase) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (!authError && user) {
        currentUserId = user.id;
      }
    }

    const orders = await getUserCashbackOrders(currentUserId);

    // Thống kê nhanh
    const totalCashback = orders
      .filter((o) => o.status === "completed")
      .reduce((sum, o) => sum + (o.cashback_amount || 0), 0);

    const pendingCashback = orders
      .filter((o) => o.status === "pending")
      .reduce((sum, o) => sum + (o.cashback_amount || 0), 0);

    return NextResponse.json({
      success: true,
      orders,
      stats: {
        totalOrders: orders.length,
        totalCashback,
        pendingCashback,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Khách hàng gửi yêu cầu tra cứu / báo sót đơn hàng
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    let currentUserId = "demo-user-123";

    if (supabase) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json({ error: "Vui lòng đăng nhập để tra cứu đơn." }, { status: 401 });
      }
      currentUserId = user.id;
    }

    const body = await request.json();
    const orderId = String(body.orderId || "").trim();
    const rawPlatform = String(body.platform || "Shopee").toLowerCase();
    const platform: "Shopee" | "TikTok Shop" | "Lazada" = rawPlatform.includes("tiktok")
      ? "TikTok Shop"
      : rawPlatform.includes("lazada")
        ? "Lazada"
        : "Shopee";

    const orderValue = Number(body.orderValue || 0);
    const productName = body.productName ? String(body.productName).trim() : "Đơn hàng người dùng báo soát";

    if (!orderId) {
      return NextResponse.json({ error: "Vui lòng nhập mã đơn hàng cần tra cứu." }, { status: 400 });
    }

    const result = await recordCashbackOrder({
      orderId,
      userId: currentUserId,
      platform,
      productName,
      orderValue,
      status: "pending",
      note: "Yêu cầu tra cứu từ người dùng — Đang chờ đối soát sàn",
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Đã tiếp nhận mã đơn hàng, hệ thống đang đối soát với sàn.",
      order: result.order,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
