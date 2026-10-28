import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "Chưa kết nối dữ liệu đơn hàng." }, { status: 503 });
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Vui lòng đăng nhập để xem đơn." }, { status: 401 });
  const [confirmed, claims] = await Promise.all([
    db.from("cashback_orders").select("*").eq("user_id", user.id).order("ordered_at", { ascending: false }),
    db.from("cashback_order_claims").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  if (confirmed.error || claims.error) return NextResponse.json({ error: "Chưa tải được đơn hàng. Vui lòng thử lại." }, { status: 503 });
  const verified = confirmed.data || [];
  const keys = new Set(verified.map(order => `${order.platform}:${order.order_id}`));
  const orders = [...verified, ...(claims.data || []).filter(claim => !keys.has(`${claim.platform}:${claim.order_id}`)).map(claim => ({
    ...claim, status: "pending", cashback_amount: 0, commission_amount: 0, ordered_at: claim.created_at,
    note: "Yêu cầu tra cứu — chưa có xác nhận và hoa hồng từ sàn.",
  }))].sort((a,b) => Date.parse(b.ordered_at)-Date.parse(a.ordered_at));
  return NextResponse.json({ success: true, orders, stats: {
    totalOrders: orders.length,
    totalCashback: verified.filter(order => order.status === "completed").reduce((sum,order) => sum+Number(order.cashback_amount),0),
    pendingCashback: verified.filter(order => order.status === "pending").reduce((sum,order) => sum+Number(order.cashback_amount),0),
  } });
}

/** Missing-order reports never manufacture commission or touch the wallet. */
export async function POST(request: NextRequest) {
  const db = await createSupabaseServerClient();
  if (!db) return NextResponse.json({ error: "Chưa kết nối dữ liệu đơn hàng." }, { status: 503 });
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Vui lòng đăng nhập để tra cứu đơn." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const orderId = String(body?.orderId || "").trim();
  const platform = String(body?.platform || "Shopee");
  const orderValue = Number(body?.orderValue ?? 0);
  if (!orderId || orderId.length > 128 || !["Shopee", "ShopeeFood", "TikTok Shop", "Lazada"].includes(platform) || !Number.isSafeInteger(orderValue) || orderValue < 0) {
    return NextResponse.json({ error: "Thông tin đơn hàng không hợp lệ." }, { status: 400 });
  }
  const { data, error } = await db.from("cashback_order_claims").insert({
    user_id: user.id, order_id: orderId, platform, order_value: orderValue,
    product_name: String(body?.productName || "Đơn hàng chờ tra cứu").slice(0,500),
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "Bạn đã gửi yêu cầu tra cứu đơn này." : "Chưa lưu được yêu cầu. Vui lòng thử lại." }, { status: error.code === "23505" ? 409 : 503 });
  return NextResponse.json({ success: true, order: {
    ...data, status: "pending", cashback_amount: 0, ordered_at: data.created_at,
    note: "Yêu cầu tra cứu — chưa có xác nhận và hoa hồng từ sàn.",
  } });
}
