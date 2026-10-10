import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import { recordCashbackOrder } from "@/lib/deals/cashback";
import { parseShopeeMoney } from "@/lib/deals/shopee-import";
import { parseUserIdFromSubId } from "@/lib/deals/affiliate";
import { getBoosterSettingsSync } from "@/lib/deals/cashback-booster";
import { getShopeeSyncConfig, saveShopeeSyncConfig } from "@/lib/deals/shopee-sync-config";

export const dynamic = "force-dynamic";

/**
 * Lấy cấu hình và trạng thái tự động chạy ngầm của Shopee
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
    }

    const config = getShopeeSyncConfig();
    return NextResponse.json({
      success: true,
      config: {
        ...config,
        // Che một phần cookie để bảo mật khi trả về
        shopeeCookieMasked: config.shopeeCookie
          ? config.shopeeCookie.slice(0, 15) + "..." + config.shopeeCookie.slice(-10)
          : "",
        hasCookie: Boolean(config.shopeeCookie),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * API Kích hoạt đồng bộ hoặc lưu cấu hình tự động chạy ngầm
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền thực hiện. Yêu cầu quyền Admin." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    // Cập nhật bật/tắt chế độ tự động chạy ngầm
    if (typeof body.autoSyncEnabled === "boolean") {
      const updated = saveShopeeSyncConfig({ autoSyncEnabled: body.autoSyncEnabled });
      return NextResponse.json({
        success: true,
        message: `Đã ${body.autoSyncEnabled ? "BẬT" : "TẮT"} chế độ tự động đồng bộ ngầm 24/7!`,
        config: updated,
      });
    }

    const currentConfig = getShopeeSyncConfig();
    const cookie =
      (body.cookie as string)?.trim() ||
      currentConfig.shopeeCookie?.trim() ||
      process.env.SHOPEE_AFFILIATE_COOKIE?.trim() ||
      "";

    if (!cookie) {
      return NextResponse.json(
        {
          error:
            "Chưa cấu hình Shopee Cookie. Vui lòng dán Shopee Cookie hoặc lưu biến SHOPEE_AFFILIATE_COOKIE.",
        },
        { status: 400 }
      );
    }

    // Lưu cookie vào cấu hình bền vững
    saveShopeeSyncConfig({ shopeeCookie: cookie });

    // Tính toán khoảng thời gian (30 ngày gần nhất)
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - 30 * 86400;

    const shopeeApiUrl = `https://affiliate.shopee.vn/api/v3/conversion_report?start_time=${thirtyDaysAgo}&end_time=${now}&page=1&limit=50`;

    let shopeeData: any = null;
    let fetchError: string | null = null;

    try {
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

      if (res.ok) {
        shopeeData = await res.json();
      } else {
        fetchError = `Shopee API trả về mã lỗi HTTP ${res.status}`;
      }
    } catch (err: unknown) {
      fetchError = err instanceof Error ? err.message : "Lỗi kết nối tới máy chủ Shopee";
    }

    if (!shopeeData || (shopeeData.code !== 0 && !Array.isArray(shopeeData?.data?.list))) {
      const errMsg =
        fetchError ||
        shopeeData?.msg ||
        "Cookie Shopee không hợp lệ hoặc đã hết hạn phiên đăng nhập. Vui lòng đăng nhập lại Shopee và lấy cookie mới.";
      saveShopeeSyncConfig({
        lastSyncAt: new Date().toISOString(),
        lastSyncResult: `Lỗi: ${errMsg}`,
      });
      return NextResponse.json(
        {
          success: false,
          error: errMsg,
          needsRefresh: true,
        },
        { status: 400 }
      );
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

      const res = await recordCashbackOrder({
        orderId,
        subId,
        userId,
        platform: "Shopee",
        productName: item.item_name || item.product_name || "Sản phẩm mua qua DealHoàn",
        orderValue,
        commissionAmount,
        cashbackAmount,
        status,
        note: `Tự động đồng bộ từ Shopee qua Bot API (${new Date().toLocaleDateString("vi-VN")})`,
      });

      if (res.success) {
        successCount++;
        totalCashback += cashbackAmount;
        userSet.add(userId);
      }
    }

    const summaryMsg = `Đã đồng bộ thành công ${successCount} đơn hàng cho ${userSet.size} thành viên!`;
    saveShopeeSyncConfig({
      lastSyncAt: new Date().toISOString(),
      lastSyncResult: summaryMsg,
      lastOrdersCount: successCount,
    });

    return NextResponse.json({
      success: true,
      message: summaryMsg,
      summary: {
        totalOrdersFound: rawList.length,
        successCount,
        matchedUsersCount: userSet.size,
        totalCashback,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
