import { isAuthorizedCron } from "@/lib/cron/auth";
import { NextRequest, NextResponse } from "next/server";
import { syncShopeeOrders } from "@/lib/deals/order-sync";
import { autoSettleHoldPeriodOrders } from "@/lib/deals/cashback";

export const dynamic = "force-dynamic";
export const maxDuration = 150;
export async function GET(request: NextRequest) { return handleSync(request); }
export async function POST(request: NextRequest) { return handleSync(request); }
async function handleSync(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized cron execution" }, { status: 401 });
  
  // Tự động kiểm tra đối soát T+15 mỗi 15 phút (chuyển pending -> completed & chuyển tiền vào ví khả dụng cho khách)
  const settlement = await autoSettleHoldPeriodOrders().catch((e) => {
    console.error("[cron/sync-orders] autoSettle error:", e);
    return { settledCount: 0, revertedCount: 0, reconciledCount: 0 };
  });

  try {
    const result = await syncShopeeOrders();
    const body = typeof result.body === "object" && result.body !== null ? result.body : {};
    return NextResponse.json({
      ...body,
      autoSettled: settlement.settledCount,
      autoReverted: settlement.revertedCount,
      autoReconciled: settlement.reconciledCount,
    }, { status: result.code, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      success: true,
      status: "order_sync_partial",
      autoSettled: settlement.settledCount,
      autoReverted: settlement.revertedCount,
      autoReconciled: settlement.reconciledCount,
      message: "Đã tự động đối soát đơn T+15 ngầm thành công",
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
