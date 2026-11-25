import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { recordCashbackOrder } from "@/lib/deals/cashback";
import {
  buildLazadaOrderId,
  parseLazadaConversionStatus,
} from "@/lib/deals/lazada-affiliate";
import {
  buildRioHubOrderId,
  extractRioHubSubId,
  parseRioHubOrderStatus,
  verifyRioHubWebhookSignature,
} from "@/lib/deals/riohub-affiliate";

export const dynamic = "force-dynamic";
function validSecret(provided: string | null, expected: string) {
  const a = Buffer.from(provided || ""), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a,b);
}

/**
 * Webhook / Postback tiếp nhận đơn hàng hoàn tiền từ AccessTrade, Shopee hoặc đối tác
 * Hỗ trợ cả GET (AccessTrade Postback URL) và POST (JSON Webhook)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // 1. Kiểm tra mã bảo mật Webhook (nếu được cấu hình)
  const webhookSecret = process.env.AFFILIATE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) return NextResponse.json({ error: "Webhook chưa được cấu hình." }, { status: 503 });
  {
    const providedSecret = searchParams.get("secret") || searchParams.get("token");
    if (!validSecret(providedSecret, webhookSecret)) {
      return NextResponse.json({ error: "Unauthorized webhook secret" }, { status: 401 });
    }
  }

  // 2. Trích xuất tham số từ AccessTrade / Lazada / Postback URL query
  const platformParam = (
    searchParams.get("merchant") ||
    searchParams.get("platform") ||
    "shopee"
  ).toLowerCase();

  const platform: "Shopee" | "ShopeeFood" | "TikTok Shop" | "Lazada" = platformParam.includes("tiktok")
    ? "TikTok Shop"
    : platformParam.includes("lazada")
      ? "Lazada"
      : platformParam.includes("food")
        ? "ShopeeFood"
        : "Shopee";

  const orderId =
    platform === "Lazada"
      ? buildLazadaOrderId({
          orderId:
            searchParams.get("order_id") ||
            searchParams.get("orderId") ||
            searchParams.get("order_code") ||
            searchParams.get("transaction_id") ||
            "",
          orderLineId:
            searchParams.get("order_line_id") ||
            searchParams.get("orderLineId") ||
            searchParams.get("conversion_id") ||
            searchParams.get("conversionId") ||
            searchParams.get("sku_id") ||
            searchParams.get("skuId") ||
            searchParams.get("sku") ||
            "",
        })
      : searchParams.get("order_id") ||
        searchParams.get("order_code") ||
        searchParams.get("transaction_id") ||
        "";

  const subId =
    searchParams.get("sub_aff_id") ||
    searchParams.get("subAffId") ||
    searchParams.get("sub_id1") ||
    searchParams.get("subId1") ||
    searchParams.get("sub1") ||
    searchParams.get("sub_1") ||
    searchParams.get("sub_id") ||
    searchParams.get("sub") ||
    searchParams.get("user_id") ||
    "";

  const productName =
    searchParams.get("product_name") ||
    searchParams.get("sku_name") ||
    searchParams.get("skuName") ||
    searchParams.get("item_name") ||
    (platform === "Lazada" ? "Sản phẩm Lazada mua qua DealHoàn" : "Sản phẩm mua qua DealHoàn");
  const orderValueRaw =
    searchParams.get("order_amount") ??
    searchParams.get("order_amt") ??
    searchParams.get("orderAmt") ??
    searchParams.get("transaction_value");
  const orderValue = orderValueRaw === null ? undefined : Number(orderValueRaw);
  const commissionRaw =
    searchParams.get("pub_commission") ??
    searchParams.get("est_payout") ??
    searchParams.get("estPayout") ??
    searchParams.get("payout") ??
    searchParams.get("commission");
  const commissionAmount = commissionRaw === null ? undefined : Number(commissionRaw);
  const rawStatus = (searchParams.get("status") || "pending").toLowerCase();

  const status: "pending" | "completed" | "rejected" =
    platform === "Lazada"
      ? (parseLazadaConversionStatus({
          status: searchParams.get("status") ?? searchParams.get("order_status") ?? "",
          validity: searchParams.get("validity") ?? searchParams.get("is_valid") ?? "",
        }) ?? "pending")
      : rawStatus === "2" || rawStatus === "approved" || rawStatus === "completed"
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
    actorType: "webhook",
    actorId: platform,
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
    const rawBody = await request.text();
    const webhookSecret = process.env.AFFILIATE_WEBHOOK_SECRET?.trim();
    const riohubSecret = process.env.RIOHUB_WEBHOOK_SECRET?.trim();
    const riohubSig =
      request.headers.get("x-riohub-signature") ||
      request.headers.get("x-signature") ||
      request.headers.get("x-hub-signature-256");

    const isValidRioHubHmac = Boolean(
      riohubSecret && verifyRioHubWebhookSignature(rawBody, riohubSig, riohubSecret)
    );

    if (!isValidRioHubHmac) {
      if (!webhookSecret) {
        return NextResponse.json({ error: "Webhook chưa được cấu hình." }, { status: 503 });
      }
      const headerSecret = request.headers.get("x-webhook-secret");
      const urlSecret = request.nextUrl.searchParams.get("secret");
      if (!validSecret(headerSecret, webhookSecret) && !validSecret(urlSecret, webhookSecret)) {
        return NextResponse.json({ error: "Unauthorized webhook secret" }, { status: 401 });
      }
    }

    let parsedJson: Record<string, unknown> = {};
    try {
      const p = JSON.parse(rawBody || "{}");
      if (p && typeof p === "object") parsedJson = p as Record<string, unknown>;
    } catch {}
    // Unwrap nested RioHub event payload (`{ event: "...", data: { ... } }`) if present
    const body: Record<string, unknown> =
      parsedJson.data && typeof parsedJson.data === "object" && !Array.isArray(parsedJson.data)
        ? { ...parsedJson, ...(parsedJson.data as Record<string, unknown>) }
        : parsedJson;

    // Hỗ trợ định dạng RioHub TikTok Shop, Lazada Open API, AccessTrade, Shopee Open API và DealHoàn
    const queryPlatform = request.nextUrl.searchParams.get("platform") || "";
    const inferredRioHub =
      isValidRioHubHmac ||
      Boolean(body.creator_username) ||
      Boolean(body.actual_commission !== undefined || body.estimated_commission !== undefined);
    const rawPlatform = String(
      body.platform || body.merchant || queryPlatform || (inferredRioHub ? "tiktok" : "Shopee")
    ).toLowerCase();

    const platform: "Shopee" | "ShopeeFood" | "TikTok Shop" | "Lazada" = rawPlatform.includes("tiktok")
      ? "TikTok Shop"
      : rawPlatform.includes("lazada")
        ? "Lazada"
        : rawPlatform.includes("food")
          ? "ShopeeFood"
          : "Shopee";

    const orderId =
      platform === "Lazada"
        ? buildLazadaOrderId(body)
        : platform === "TikTok Shop"
          ? buildRioHubOrderId(body)
          : String(body.orderId || body.order_id || body.order_code || "").trim();
    const subId =
      platform === "TikTok Shop"
        ? extractRioHubSubId(body)
        : String(
            body.subAffId ||
              body.sub_aff_id ||
              body.subId1 ||
              body.sub_id1 ||
              body.subId ||
              body.sub_id ||
              body.sub1 ||
              body.sub_1 ||
              ""
          ).trim();
    // The partner must send the tracking reference, never an independently supplied owner.

    const productName = String(
      body.productName ||
        body.product_name ||
        body.title ||
        body.skuName ||
        body.sku_name ||
        (platform === "Lazada"
          ? "Sản phẩm Lazada mua qua DealHoàn"
          : platform === "TikTok Shop"
            ? "Sản phẩm TikTok Shop mua qua DealHoàn"
            : "Sản phẩm mua qua DealHoàn")
    );
    const productImage = String(body.productImage || body.product_image || body.main_image_url || "");
    const orderValueRaw =
      body.orderValue ??
      body.order_value ??
      body.payment_amount ??
      body.gmv ??
      body.orderAmt ??
      body.order_amt ??
      body.transaction_value;
    const orderValue = orderValueRaw === undefined ? undefined : Number(orderValueRaw);
    const commissionRaw =
      body.commissionAmount ??
      body.commission_amount ??
      body.actual_commission ??
      body.estimated_commission ??
      body.estPayout ??
      body.est_payout ??
      body.payout ??
      body.pub_commission ??
      body.commission;
    const commissionAmount = commissionRaw === undefined ? undefined : Number(commissionRaw);
    const cashbackAmount = body.cashbackAmount === undefined ? undefined : Number(body.cashbackAmount);
    const rawStatus = String(body.status || body.order_status || "pending").toLowerCase();

    const status: "pending" | "completed" | "rejected" =
      platform === "Lazada"
        ? (parseLazadaConversionStatus(body) ?? "pending")
        : platform === "TikTok Shop"
          ? (parseRioHubOrderStatus(body) ?? "pending")
          : rawStatus === "2" || rawStatus === "approved" || rawStatus === "completed"
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
      platform,
      productName,
      productImage,
      orderValue,
      commissionAmount,
      cashbackAmount,
      status,
      note:
        typeof body.note === "string" && body.note.trim()
          ? body.note.trim()
          : `Ghi nhận qua Webhook ${platform}`,
      actorType: "webhook",
      actorId: platform,
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
