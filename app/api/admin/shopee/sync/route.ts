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

    // Nạp đơn hàng trực tiếp từ file CSV Shopee Affiliate (hỗ trợ cả dạng lô orders đã parse gọn từ client lẫn csvContent nguyên bản)
    const hasOrdersBatch = Array.isArray(body.orders);
    const hasCsvContent = typeof body.csvContent === "string" && body.csvContent.trim().length > 0;

    if (hasOrdersBatch || hasCsvContent) {
      const { parseShopeeConversionReport } = await import("@/lib/deals/shopee-import");
      const { recordCashbackOrder, loadAllAuthUserIds } = await import("@/lib/deals/cashback");
      const { getBoosterSettings } = await import("@/lib/deals/cashback-booster");
      const { isAdminSettledNote, buildAdminSettlementNote } = await import("@/lib/deals/shopee-payout");
      const { parseUserIdFromSubId } = await import("@/lib/deals/affiliate");

      const boosterSettings = await getBoosterSettings({ forceRefresh: true });
      const safeMultiplier = Math.max(0.5, Math.min(0.98, (boosterSettings.userCashbackPercent ?? 88) / 100));

      interface NormalizedImportOrder {
        orderId: string;
        subId: string;
        userId?: string | null;
        productName: string;
        orderValue: number;
        commissionAmount: number;
        cashbackAmount: number;
        status: "pending" | "completed" | "rejected";
        orderedAt?: string;
        completedAt?: string;
        note?: string;
      }

      let validOrders: NormalizedImportOrder[] = [];
      let unmatchedOrders: Array<{
        orderId: string;
        subId: string;
        productName: string;
        commissionAmount: number;
        orderedAt: string;
        status: "pending" | "completed" | "rejected";
      }> = [];
      let totalRows = 0;
      let warnings: string[] = [];

      if (hasCsvContent) {
        const report = parseShopeeConversionReport(body.csvContent, {
          userCashbackPercent: boosterSettings.userCashbackPercent,
        });
        validOrders = report.validOrders;
        unmatchedOrders = report.unmatchedOrders.map((u) => ({
          orderId: u.orderId,
          subId: u.subId || "(trống)",
          productName: u.productName,
          commissionAmount: u.commissionAmount,
          orderedAt: u.orderedAt,
          status: u.status,
        }));
        totalRows = report.totalRows;
        warnings = report.warnings;
      } else {
        const rawOrders = body.orders as Array<Record<string, unknown>>;
        totalRows = typeof body.totalRows === "number" && body.totalRows >= 0 ? body.totalRows : rawOrders.length;
        for (const item of rawOrders) {
          const orderId = String(item?.orderId || "").trim();
          const subId = String(item?.subId || "").trim();
          if (!orderId || !subId) continue;
          const rawStatus = String(item?.status || "pending");
          const status: "pending" | "completed" | "rejected" =
            rawStatus === "completed" || rawStatus === "rejected" ? rawStatus : "pending";
          const orderValue = Math.max(0, Math.round(Number(item?.orderValue) || 0));
          const commissionAmount = Math.max(0, Math.round(Number(item?.commissionAmount) || 0));
          // Luôn tính lại tiền hoàn phía server sau thuế/phí 11% để đảm bảo đồng nhất cấu hình
          const netCommission = Math.round(commissionAmount * 0.89);
          const cashbackAmount = Math.round(netCommission * safeMultiplier);
          const parsedUid = parseUserIdFromSubId(subId);
          validOrders.push({
            orderId,
            subId,
            userId: parsedUid || (typeof item?.userId === "string" ? item.userId.trim() : null),
            productName: String(item?.productName || "Sản phẩm Shopee").trim() || "Sản phẩm Shopee",
            orderValue,
            commissionAmount,
            cashbackAmount,
            status,
            orderedAt: typeof item?.orderedAt === "string" && item.orderedAt ? item.orderedAt : undefined,
            completedAt: typeof item?.completedAt === "string" && item.completedAt ? item.completedAt : undefined,
            note: typeof item?.note === "string" && item.note ? item.note : undefined,
          });
        }
      }

      const existingMap = new Map<string, { status: string; note?: string | null }>();
      const supabaseAdmin = getSupabaseAdminClient();
      const importOrderIds = Array.from(new Set(validOrders.map((o) => o.orderId).filter(Boolean)));
      // Truy vấn theo từng lô 100 mã đơn để tránh vượt giới hạn độ dài URL của PostgREST (.in)
      if (supabaseAdmin && importOrderIds.length > 0) {
        const EXISTING_CHUNK = 100;
        for (let i = 0; i < importOrderIds.length; i += EXISTING_CHUNK) {
          const idChunk = importOrderIds.slice(i, i + EXISTING_CHUNK);
          const { data: existingRows } = await supabaseAdmin
            .from("cashback_orders")
            .select("order_id,status,note")
            .eq("platform", "Shopee")
            .in("order_id", idChunk);
          for (const row of existingRows || []) {
            existingMap.set(String(row.order_id || "").trim().toUpperCase(), {
              status: String(row.status || ""),
              note: row.note,
            });
          }
        }
      }

      const FULL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      // Nạp danh sách user auth 1 lần duy nhất nếu có Sub_ID ngắn dạng cũ (tránh gọi N+1 listUsers gây timeout)
      const needsShortIdLookup = validOrders.some((ord) => {
        const parsed = parseUserIdFromSubId(ord.subId);
        return Boolean(parsed && !FULL_UUID_RE.test(parsed));
      });
      const preloadedUserIds = needsShortIdLookup ? await loadAllAuthUserIds(supabaseAdmin) : undefined;

      let importedCount = 0;
      const syncedOrders: Array<Record<string, unknown>> = [];
      const failedOrders: Array<{ orderId: string; subId: string; productName: string; commissionAmount: number; error: string }> = [];

      const recordSingleOrder = async (ord: NormalizedImportOrder) => {
        if (!ord.orderId || !ord.subId) return;
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
          preloadedUserIds,
          actorType: "admin",
          actorId: auth.user?.email || "admin_csv_import",
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
      };

      // Chạy song song giới hạn 5 đơn/lượt để tăng tốc gấp ~5 lần mà vẫn đảm bảo an toàn DB
      const CONCURRENCY = 5;
      let cursor = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, validOrders.length) }, async () => {
        while (cursor < validOrders.length) {
          const idx = cursor++;
          await recordSingleOrder(validOrders[idx]);
        }
      });
      await Promise.all(workers);

      const extraNotices: string[] = [];
      if (unmatchedOrders.length > 0) extraNotices.push(`${unmatchedOrders.length} đơn chưa khớp Sub_ID`);
      if (failedOrders.length > 0) extraNotices.push(`${failedOrders.length} đơn lưu lỗi`);
      const suffix = extraNotices.length > 0 ? ` (${extraNotices.join(", ")})` : "";

      if (body.skipConfigUpdate !== true) {
        const summary = body.summary as
          | { importedCount?: number; totalRows?: number; unmatchedCount?: number; failedCount?: number }
          | undefined;
        const finalImported = typeof summary?.importedCount === "number" ? summary.importedCount + importedCount : importedCount;
        const finalTotal = typeof summary?.totalRows === "number" ? summary.totalRows : totalRows;
        const finalUnmatched = typeof summary?.unmatchedCount === "number" ? summary.unmatchedCount : unmatchedOrders.length;
        const finalFailed = typeof summary?.failedCount === "number" ? summary.failedCount + failedOrders.length : failedOrders.length;
        const summaryNotices: string[] = [];
        if (finalUnmatched > 0) summaryNotices.push(`${finalUnmatched} đơn chưa khớp Sub_ID`);
        if (finalFailed > 0) summaryNotices.push(`${finalFailed} đơn lưu lỗi`);
        const summarySuffix = summaryNotices.length > 0 ? ` (${summaryNotices.join(", ")})` : "";
        try {
          await saveOrderSyncConfig({
            lastSyncAt: new Date().toISOString(),
            lastSyncResult: `Nạp CSV: ${finalImported}/${finalTotal} đơn${summarySuffix}`,
            lastOrdersCount: finalImported,
          });
        } catch (cfgErr) {
          console.warn("saveOrderSyncConfig warning after CSV import:", cfgErr);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Đã nạp ${importedCount}/${totalRows} đơn hàng từ file CSV Shopee!${suffix}`,
        importedCount,
        totalRows,
        syncedOrders,
        unmatchedOrders,
        failedOrders,
        warnings,
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
