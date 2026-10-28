import { isAuthorizedCron } from "@/lib/cron/auth";
import { NextRequest, NextResponse } from "next/server";
import { syncShopeeOrders } from "@/lib/deals/order-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 150;
export async function GET(request: NextRequest) { return handleSync(request); }
export async function POST(request: NextRequest) { return handleSync(request); }
async function handleSync(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized cron execution" }, { status: 401 });
  try {
    const result = await syncShopeeOrders();
    return NextResponse.json(result.body, { status: result.code, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ success: false, status: "order_sync_failed" }, { status: 502 });
  }
}
