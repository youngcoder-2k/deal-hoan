import { NextRequest, NextResponse } from "next/server";
import { recordCashbackOrder } from "@/lib/deals/cashback";

export const dynamic = "force-dynamic";

/**
 * Webhook / Postback tiếp nhận đơn hàng hoàn tiền từ AccessTrade, Shopee hoặc đối tác
 * Hỗ trợ cả GET (AccessTrade Postback URL) và POST (JSON Webhook)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // 1. Kiểm tra mã bảo mật Webhook (nếu được cấu hình)
  const webhookSecret = process.env.AFFILIATE_WEBHOOK_SECRET?.trim();
  if (webhookSecret) {
    const providedSecret = searchParams.get("secret") || searchParams.get("token");
    if (providedSecret !== webhookSecret) {
      return NextResponse.json({ error: "Unauthorized webhook secret" }, { status: 401 });
    }
  }

  // 2. Trích xuất tham số từ AccessTrade / Postback URL query
  const orderId =
    searchParams.get("order_id") ||
    searchParams.get("order_code") ||
    searchParams.get("transaction_id") ||
    "";
  const subId =
    searchParams.get("sub1") ||
    searchParams.get("sub_id") ||
    searchParams.get("sub") ||
    searchParams.get("user_id") ||
    "";
  const platformParam = (
    searchParams.get("merchant") ||
    searchParams.get("platform") ||
    "shopee"
  ).toLowerCase();

  const platform = platformParam.includes("tiktok")
    ? "TikTok Shop"
    : platformParam.includes("lazada")
      ? "Lazada"
      : "Shopee";

  const productName = searchParams.get("product_name") || searchParams.get("item_name") || "Sản phẩm mua qua DealHoàn";
  const orderValue = Number(searchParams.get("order_amount") || searchParams.get("transaction_value") || 0);
  const commissionAmount = Number(
    searchParams.get("pub_commission") || searchParams.get("commission") || 0
  );
  const rawStatus = (searchParams.get("status") || "pending").toLowerCase();

  const status: "pending" | "completed" | "rejected" =
    rawStatus === "2" || rawStatus === "approved" || rawStatus === "completed" || rawStatus === "success"
      ? "completed"
      : rawStatus === "3" || rawStatus === "rejected" || rawStatus === "cancelled"
        ? "rejected"
        : "pending";

  if (!orderId) {
    return NextResponse.json({ error: "Missing order_id parameter" }, { status: 400 });
  }

  const result = await recordCashbackOrder({
    orderId,
    subId,
    platform,
    productName,
    orderValue,
    commissionAmount,
    status,
    note: `Ghi nhận tự động từ Postback ${platform}`,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message: "Ghi nhận đơn hàng thành công",
    order: result.order,
  });
}

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.AFFILIATE_WEBHOOK_SECRET?.trim();
    if (webhookSecret) {
      const headerSecret = request.headers.get("x-webhook-secret");
      const urlSecret = request.nextUrl.searchParams.get("secret");
      if (headerSecret !== webhookSecret && urlSecret !== webhookSecret) {
        return NextResponse.json({ error: "Unauthorized webhook secret" }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));

    // Hỗ trợ cả định dạng AccessTrade, Shopee Open API và định dạng chuẩn DealHoàn
    const orderId = String(body.orderId || body.order_id || body.order_code || "").trim();
    const subId = String(body.subId || body.sub_id || body.sub1 || "").trim();
    const userId = body.userId ? String(body.userId).trim() : undefined;
    const rawPlatform = String(body.platform || body.merchant || "Shopee").toLowerCase();

    const platform: "Shopee" | "TikTok Shop" | "Lazada" = rawPlatform.includes("tiktok")
      ? "TikTok Shop"
      : rawPlatform.includes("lazada")
        ? "Lazada"
        : "Shopee";

    const productName = body.productName || body.product_name || "Sản phẩm mua qua DealHoàn";
    const productImage = body.productImage || body.product_image || "";
    const orderValue = Number(body.orderValue || body.order_value || body.transaction_value || 0);
    const commissionAmount = Number(
      body.commissionAmount || body.commission_amount || body.pub_commission || body.commission || 0
    );
    const cashbackAmount = body.cashbackAmount ? Number(body.cashbackAmount) : undefined;
    const rawStatus = String(body.status || "pending").toLowerCase();

    const status: "pending" | "completed" | "rejected" =
      rawStatus === "2" || rawStatus === "approved" || rawStatus === "completed" || rawStatus === "success"
        ? "completed"
        : rawStatus === "3" || rawStatus === "rejected" || rawStatus === "cancelled"
          ? "rejected"
          : "pending";

    if (!orderId) {
      return NextResponse.json({ error: "Thiếu thông tin orderId" }, { status: 400 });
    }

    const result = await recordCashbackOrder({
      orderId,
      subId,
      userId,
      platform,
      productName,
      productImage,
      orderValue,
      commissionAmount,
      cashbackAmount,
      status,
      note: body.note || `Ghi nhận qua Webhook ${platform}`,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Ghi nhận đơn hàng thành công",
      order: result.order,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
