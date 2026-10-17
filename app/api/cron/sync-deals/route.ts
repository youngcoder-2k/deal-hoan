import { isAuthorizedCron } from "@/lib/cron/auth";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getCuratedXtraDeals } from "@/lib/deals/providers/curated-xtra";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return handleSyncDeals(request); }
export async function POST(request: NextRequest) { return handleSyncDeals(request); }

/** Publish fresh Xtra imports only. This endpoint does not scrape or manufacture offers. */
async function handleSyncDeals(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized cron execution" }, { status: 401 });
  const deals = getCuratedXtraDeals();
  revalidatePath("/");
  revalidateTag("deals", { expire: 0 });
  return NextResponse.json({
    success: deals.length > 0,
    status: deals.length ? "xtra_ready" : "awaiting_xtra_import",
    message: deals.length ? "Đã làm mới danh sách Shopee Xtra." : "Chưa có dữ liệu sản phẩm Shopee Xtra còn hiệu lực. Cần chạy luồng nhập Xtra với phiên Shopee Affiliate.",
    counts: { xtraDeals: deals.length }, timestamp: new Date().toISOString(),
  });
}
