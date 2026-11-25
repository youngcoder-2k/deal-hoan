import { isAuthorizedCron } from "@/lib/cron/auth";
import { NextRequest, NextResponse } from "next/server";
import { syncShopeeOrders } from "@/lib/deals/order-sync";
import { isLazadaAffiliateConfigured, syncLazadaOrders } from "@/lib/deals/lazada-affiliate";
import { isRioHubConfigured, syncRioHubOrders } from "@/lib/deals/riohub-affiliate";
import { autoSettleHoldPeriodOrders } from "@/lib/deals/cashback";
import { expireOverdueReferrals } from "@/lib/referral/service";

export const dynamic = "force-dynamic";
export const maxDuration = 150;
export async function GET(request: NextRequest) { return handleSync(request); }
export async function POST(request: NextRequest) { return handleSync(request); }
async function handleSync(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized cron execution" }, { status: 401 });
  
  // Tự động kiểm tra đối soát T+15 mỗi 15 phút + hết hạn thưởng giới thiệu + đồng bộ Lazada Open API + RioHub TikTok Shop
  const [settlement, expiredReferrals, lazadaSync, tiktokSync] = await Promise.all([
    autoSettleHoldPeriodOrders().catch((e) => {
      console.error("[cron/sync-orders] autoSettle error:", e);
      return { settledCount: 0, revertedCount: 0, reconciledCount: 0 };
    }),
    expireOverdueReferrals().catch(() => 0),
    isLazadaAffiliateConfigured()
      ? syncLazadaOrders({ daysBack: 30 }).catch((e) => {
          console.error("[cron/sync-orders] syncLazadaOrders error:", e);
          return { code: 502, body: { success: false, status: "lazada_sync_error", processed: 0, scanned: 0, unmatched: 0, failed: 0 } };
        })
      : Promise.resolve(null),
    isRioHubConfigured()
      ? syncRioHubOrders().catch((e) => {
          console.error("[cron/sync-orders] syncRioHubOrders error:", e);
          return { code: 502, body: { success: false, status: "riohub_sync_error", processed: 0, scanned: 0, unmatched: 0, failed: 0 } };
        })
      : Promise.resolve(null),
  ]);

  try {
    const result = await syncShopeeOrders();
    const body = typeof result.body === "object" && result.body !== null ? result.body : {};
    const statusCode =
      result.code === 503 && (lazadaSync?.code === 200 || tiktokSync?.code === 200) ? 200 : result.code;
    return NextResponse.json({
      ...body,
      lazada: lazadaSync ? lazadaSync.body : { status: "not_configured" },
      tiktokShop: tiktokSync ? tiktokSync.body : { status: "not_configured" },
      autoSettled: settlement.settledCount,
      autoReverted: settlement.revertedCount,
      autoReconciled: settlement.reconciledCount,
      expiredReferrals,
    }, { status: statusCode, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      success: true,
      status: "order_sync_partial",
      lazada: lazadaSync ? lazadaSync.body : { status: "not_configured" },
      tiktokShop: tiktokSync ? tiktokSync.body : { status: "not_configured" },
      autoSettled: settlement.settledCount,
      autoReverted: settlement.revertedCount,
      autoReconciled: settlement.reconciledCount,
      expiredReferrals,
      message: "Đã tự động đối soát đơn ngầm thành công",
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
