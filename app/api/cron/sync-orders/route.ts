import { NextRequest, NextResponse } from "next/server";
import { recordCashbackOrder } from "@/lib/deals/cashback";
import { parseShopeeMoney } from "@/lib/deals/shopee-import";
import { parseUserIdFromSubId } from "@/lib/deals/affiliate";
import { getBoosterSettingsSync } from "@/lib/deals/cashback-booster";
import { getShopeeSyncConfig, saveShopeeSyncConfig } from "@/lib/deals/shopee-sync-config";

export const dynamic = "force-dynamic";

/**
 * Endpoint chạy ngầm 24/7 tự động kéo đơn hàng từ Shopee về DealHoàn
 * Hỗ trợ Vercel Cron, GitHub Actions, hoặc Server Interval
 */
export async function GET(request: NextRequest) {
  return handleAutomatedSync(request);
}

export async function POST(request: NextRequest) {
  return handleAutomatedSync(request);
}

async function handleAutomatedSync(request: NextRequest) {
  try {
    // Kiểm tra cron secret nếu có cấu hình
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      const urlSecret = request.nextUrl.searchParams.get("secret");
      if (urlSecret !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized cron execution" }, { status: 401 });
      }
    }

    const config = getShopeeSyncConfig();
    const cookie = config.shopeeCookie?.trim() || process.env.SHOPEE_AFFILIATE_COOKIE?.trim() || "";

    if (!cookie) {
      return NextResponse.json({
        success: false,
        message: "Chưa cấu hình Shopee Cookie. Vui lòng dán cookie vào Admin hoặc lưu biến SHOPEE_AFFILIATE_COOKIE.",
      });
    }

    if (!config.autoSyncEnabled) {
      return NextResponse.json({
        success: false,
        message: "Chế độ tự động đồng bộ đang tắt trong cấu hình.",
      });
    }

    // Lấy 30 ngày gần nhất
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 86400;

    const shopeeApiUrl = `https://affiliate.shopee.vn/api/v3/conversion_report?start_time=${thirtyDaysAgo}&end_time=${now}&page=1&limit=50`;

    const res = await fetch(shopeeApiUrl, {
      headers: {
        Cookie: cookie,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        Referer: "https://affiliate.shopee.vn/report/conversion",
      },
      signal: AbortSignal.timeout(9000),
    });

    if (!res.ok) {
      const errorMsg = `Shopee API trả về HTTP ${res.status}`;
      saveShopeeSyncConfig({
        lastSyncAt: new Date().toISOString(),
        lastSyncResult: `Lỗi: ${errorMsg}`,
      });
      return NextResponse.json({ success: false, error: errorMsg }, { status: 502 });
    }

    const shopeeData = await res.json().catch(() => null);
    if (!shopeeData || (shopeeData.code !== 0 && !Array.isArray(shopeeData?.data?.list))) {
      const errorMsg = shopeeData?.msg || "Cookie Shopee đã hết hạn";
      saveShopeeSyncConfig({
        lastSyncAt: new Date().toISOString(),
        lastSyncResult: `Lỗi: ${errorMsg}`,
      });
      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
    }

    const rawList = shopeeData?.data?.list || [];
    const boosterSettings = getBoosterSettingsSync();
    const safeMultiplier = Math.max(0.6, (100 - boosterSettings.safetyMarginPercent) / 100);

    let successCount = 0;
    let totalCashback = 0;
    const userSet = new Set<string>();

    for (const item of rawList) {
      const orderId = String(item.order_sn || item.order_id || "").trim();
      const subId = String(item.sub_id || item.sub1 || "").trim();
      const userId = parseUserIdFromSubId(subId);

      if (!orderId || !userId) continue;

      const orderValue = parseShopeeMoney(item.gmv || item.order_amount || 0);
      const commissionAmount = parseShopeeMoney(item.commission || item.pub_commission || 0);
      const cashbackAmount = Math.round(commissionAmount * safeMultiplier);

      const status: "pending" | "completed" | "rejected" =
        item.status === 2 || item.status === "completed"
          ? "completed"
          : item.status === 3 || item.status === "cancelled"
          ? "rejected"
          : "pending";

      const orderRes = await recordCashbackOrder({
        orderId,
        subId,
        userId,
        platform: "Shopee",
        productName: item.item_name || item.product_name || "Sản phẩm mua qua DealHoàn",
        orderValue,
        commissionAmount,
        cashbackAmount,
        status,
        note: `Cron tự động đồng bộ từ Shopee lúc ${new Date().toLocaleTimeString("vi-VN")}`,
      });

      if (orderRes.success) {
        successCount++;
        totalCashback += cashbackAmount;
        userSet.add(userId);
      }
    }

    const summaryMsg = `Tự động quét ${rawList.length} đơn & nạp thành công ${successCount} đơn cho ${userSet.size} thành viên`;
    saveShopeeSyncConfig({
      lastSyncAt: new Date().toISOString(),
      lastSyncResult: summaryMsg,
      lastOrdersCount: successCount,
    });

    return NextResponse.json({
      success: true,
      message: summaryMsg,
      processed: successCount,
      users: userSet.size,
      totalCashback,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
