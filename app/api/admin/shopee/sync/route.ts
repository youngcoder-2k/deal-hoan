import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import type { ShopeeSyncConfig } from "@/lib/deals/shopee-sync-config";
import { loadOrderSyncConfig, saveOrderSyncConfig, publicOrderSyncConfig } from "@/lib/deals/order-sync-config";
import { syncShopeeOrders } from "@/lib/deals/order-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 150;

/**
 * Lấy cấu hình và trạng thái tự động chạy ngầm của Shopee
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
    }

    const config = await loadOrderSyncConfig();
    const supabaseAdmin = getSupabaseAdminClient();
    let recentOrders: Record<string, unknown>[] = [];
    if (supabaseAdmin) {
      const { data } = await supabaseAdmin
        .from("cashback_orders")
        .select("*")
        .eq("platform", "Shopee")
        .order("created_at", { ascending: false })
        .limit(50);
      recentOrders = (data || []).filter((o: Record<string, unknown>) => {
        const id = String(o.order_id || "");
        const name = String(o.product_name || "").toLowerCase();
        return !id.startsWith("SP_") && !id.startsWith("TT_") && !name.includes("test");
      });
    }

    return NextResponse.json({
      success: true,
      config: publicOrderSyncConfig(config),
      recentOrders,
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

    // Cập nhật AccessTrade API Token
    if (typeof body.accesstradeToken === "string") {
      const updated = await saveOrderSyncConfig({ accesstradeToken: body.accesstradeToken.trim() });
      return NextResponse.json({
        success: true,
        message: "Đã lưu mã AccessTrade API Token cho TikTok Shop / Lazada thành công!",
        config: publicOrderSyncConfig(updated),
      });
    }

    // Cập nhật Shopee Open API (Hoa hồng Xtra & Báo cáo chuyển đổi)
    if (typeof body.shopeeAppId === "string" || typeof body.shopeeSecret === "string") {
      const updateData: Partial<ShopeeSyncConfig> = {};
      if (typeof body.shopeeAppId === "string") updateData.shopeeAppId = body.shopeeAppId.trim();
      if (typeof body.shopeeSecret === "string") updateData.shopeeSecret = body.shopeeSecret.trim();

      const updated = await saveOrderSyncConfig(updateData);
      return NextResponse.json({
        success: true,
        message: "Đã lưu Shopee Open API (App ID & Secret Key) thành công! Hệ thống sẽ tự động quét sản phẩm Hoa hồng Xtra.",
        config: publicOrderSyncConfig(updated),
      });
    }

    // Cập nhật bật/tắt chế độ tự động chạy ngầm
    if (typeof body.autoSyncEnabled === "boolean") {
      const updated = await saveOrderSyncConfig({ autoSyncEnabled: body.autoSyncEnabled });
      return NextResponse.json({
        success: true,
        message: `Đã ${body.autoSyncEnabled ? "BẬT" : "TẮT"} chế độ tự động đồng bộ ngầm 24/7!`,
        config: publicOrderSyncConfig(updated),
      });
    }

    // Nạp đơn hàng trực tiếp từ file CSV Shopee Affiliate
    if (typeof body.csvContent === "string" && body.csvContent.trim()) {
      const { parseShopeeConversionReport } = await import("@/lib/deals/shopee-import");
      const { recordCashbackOrder } = await import("@/lib/deals/cashback");
      const { getBoosterSettingsSync } = await import("@/lib/deals/cashback-booster");
      const boosterSettings = getBoosterSettingsSync();
      const report = parseShopeeConversionReport(body.csvContent, {
        userCashbackPercent: boosterSettings.userCashbackPercent,
      });

      let importedCount = 0;
      const syncedOrders: Array<Record<string, unknown>> = [];

      for (const ord of report.validOrders) {
        if (ord.orderId && ord.subId) {
          const rec = await recordCashbackOrder({
            orderId: ord.orderId,
            subId: ord.subId,
            userId: ord.userId || undefined,
            platform: "Shopee",
            productName: ord.productName,
            orderValue: ord.orderValue,
            commissionAmount: ord.commissionAmount,
            cashbackAmount: ord.cashbackAmount,
            status: ord.status,
            orderedAt: ord.orderedAt,
          });
          if (rec.success) {
            importedCount++;
            syncedOrders.push({
              orderId: ord.orderId,
              subId: ord.subId,
              userId: ord.userId || "",
              productName: ord.productName,
              orderValue: ord.orderValue,
              commissionAmount: ord.commissionAmount,
              cashbackAmount: ord.cashbackAmount,
              status: ord.status,
              orderedAt: ord.orderedAt,
            });
          }
        }
      }

      await saveOrderSyncConfig({
        lastSyncAt: new Date().toISOString(),
        lastSyncResult: `Nạp CSV: ${importedCount}/${report.validOrders.length} đơn`,
        lastOrdersCount: importedCount,
      });

      return NextResponse.json({
        success: true,
        message: `Đã nạp thành công ${importedCount}/${report.validOrders.length} đơn hàng từ file CSV Shopee!`,
        importedCount,
        syncedOrders,
        warnings: report.warnings,
      });
    }

    const cookie = typeof body.cookie === "string" ? body.cookie.trim() : undefined;
    if (cookie) await saveOrderSyncConfig({ shopeeCookie:cookie });
    const result = await syncShopeeOrders({ cookie });
    return NextResponse.json(result.body, { status:result.code });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
