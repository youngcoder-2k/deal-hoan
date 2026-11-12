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
      const { autoSettleHoldPeriodOrders } = await import("@/lib/deals/cashback");
      await autoSettleHoldPeriodOrders();

      const { data } = await supabaseAdmin
        .from("cashback_orders")
        .select("*")
        .eq("platform", "Shopee")
        .order("ordered_at", { ascending: false })
        .limit(200);

      const { isSyntheticTestOrder } = await import("@/lib/deals/shopee-import");
      const seenOrderIds = new Set<string>();
      recentOrders = (data || []).filter((o: Record<string, unknown>) => {
        if (isSyntheticTestOrder(o)) return false;
        const normId = String(o.order_id || "").trim().toUpperCase();
        if (!normId || seenOrderIds.has(normId)) return false;
        seenOrderIds.add(normId);
        return true;
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
      const { isAdminSettledNote, buildAdminSettlementNote } = await import("@/lib/deals/shopee-payout");
      const boosterSettings = getBoosterSettingsSync();
      const report = parseShopeeConversionReport(body.csvContent, {
        userCashbackPercent: boosterSettings.userCashbackPercent,
      });

      const existingMap = new Map<string, { status: string; note?: string | null }>();
      const supabaseAdmin = getSupabaseAdminClient();
      const importOrderIds = report.validOrders.map((o) => o.orderId).filter(Boolean);
      if (supabaseAdmin && importOrderIds.length > 0) {
        const { data: existingRows } = await supabaseAdmin
          .from("cashback_orders")
          .select("order_id,status,note")
          .eq("platform", "Shopee")
          .in("order_id", importOrderIds);
        for (const row of existingRows || []) {
          existingMap.set(String(row.order_id || "").trim().toUpperCase(), {
            status: String(row.status || ""),
            note: row.note,
          });
        }
      }

      const FULL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let importedCount = 0;
      const syncedOrders: Array<Record<string, unknown>> = [];
      const failedOrders: Array<{ orderId: string; subId: string; productName: string; commissionAmount: number; error: string }> = [];

      for (const ord of report.validOrders) {
        if (ord.orderId && ord.subId) {
          const explicitUuid = ord.userId && FULL_UUID_RE.test(ord.userId) ? ord.userId : undefined;
          const prev = existingMap.get(ord.orderId.trim().toUpperCase());
          const keepAdminSettled =
            prev &&
            prev.status === "completed" &&
            isAdminSettledNote(prev.note) &&
            ord.status !== "rejected";
          const effectiveStatus = keepAdminSettled ? "completed" : ord.status;
          const effectiveNote = keepAdminSettled
            ? buildAdminSettlementNote(prev.note || "Admin đã duyệt hoàn tiền", ord.note)
            : ord.note;

          const rec = await recordCashbackOrder({
            orderId: ord.orderId,
            subId: ord.subId,
            userId: explicitUuid,
            platform: "Shopee",
            productName: ord.productName,
            orderValue: ord.orderValue,
            commissionAmount: ord.commissionAmount,
            cashbackAmount: ord.cashbackAmount,
            status: effectiveStatus,
            orderedAt: ord.orderedAt,
            note: effectiveNote,
          });
          if (rec.success) {
            importedCount++;
            syncedOrders.push({
              orderId: ord.orderId,
              subId: ord.subId,
              userId: rec.order?.user_id || ord.userId || "",
              productName: ord.productName,
              orderValue: ord.orderValue,
              commissionAmount: ord.commissionAmount,
              cashbackAmount: rec.order?.cashback_amount ?? ord.cashbackAmount,
              status: effectiveStatus,
              orderedAt: ord.orderedAt,
              confirmedAt: rec.order?.confirmed_at || ord.completedAt || undefined,
              note: rec.order?.note || effectiveNote || undefined,
            });
          } else {
            failedOrders.push({
              orderId: ord.orderId,
              subId: ord.subId,
              productName: ord.productName,
              commissionAmount: ord.commissionAmount,
              error: rec.error || "Không thể ghi nhận vào cơ sở dữ liệu",
            });
          }
        }
      }

      const unmatchedOrders = report.unmatchedOrders.map((u) => ({
        orderId: u.orderId,
        subId: u.subId || "(trống)",
        productName: u.productName,
        commissionAmount: u.commissionAmount,
        orderedAt: u.orderedAt,
        status: u.status,
      }));

      const extraNotices: string[] = [];
      if (unmatchedOrders.length > 0) extraNotices.push(`${unmatchedOrders.length} đơn chưa khớp Sub_ID`);
      if (failedOrders.length > 0) extraNotices.push(`${failedOrders.length} đơn lưu lỗi`);
      const suffix = extraNotices.length > 0 ? ` (${extraNotices.join(", ")})` : "";

      await saveOrderSyncConfig({
        lastSyncAt: new Date().toISOString(),
        lastSyncResult: `Nạp CSV: ${importedCount}/${report.totalRows} đơn${suffix}`,
        lastOrdersCount: importedCount,
      });

      return NextResponse.json({
        success: true,
        message: `Đã nạp ${importedCount}/${report.totalRows} đơn hàng từ file CSV Shopee!${suffix}`,
        importedCount,
        totalRows: report.totalRows,
        syncedOrders,
        unmatchedOrders,
        failedOrders,
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
