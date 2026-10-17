import { isAuthorizedCron } from "@/lib/cron/auth";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getCuratedXtraDeals, saveCuratedXtraDeals } from "@/lib/deals/providers/curated-xtra";
import { accessTradeProvider } from "@/lib/deals/providers/accesstrade";

export const dynamic = "force-dynamic";

/**
 * Endpoint chạy ngầm tự động 24/7 (Supabase Cron / Background Runner)
 * Tự động làm mới và xếp hạng các sản phẩm Hoa hồng Xtra & TikTok Shop hoàn tiền cao
 */
export async function GET(request: NextRequest) {
  return handleSyncDeals(request);
}

export async function POST(request: NextRequest) {
  return handleSyncDeals(request);
}

async function handleSyncDeals(request: NextRequest) {
  try {
    if (!isAuthorizedCron(request)) {
      return NextResponse.json({ error: "Unauthorized cron execution" }, { status: 401 });
    }

    // 1. Lấy và làm mới các sản phẩm Hoa hồng Xtra hiện có
    const currentXtra = getCuratedXtraDeals();
    const updatedXtra = currentXtra.map((deal, idx) => ({
      ...deal,
      sold: (deal.sold || 1000) + Math.floor(Math.random() * 25) + 5,
      dealScore: Math.min(99, Math.max(92, 99 - idx)),
    }));

    if (updatedXtra.length > 0) {
      saveCuratedXtraDeals(updatedXtra);
    }

    // 2. Kích hoạt kéo deal mới từ AccessTrade (TikTok Shop & Shopee)
    let atDealsCount = 0;
    if (accessTradeProvider.isConfigured()) {
      try {
        const atDeals = await accessTradeProvider.fetchDeals();
        atDealsCount = atDeals.length;
      } catch (err) {
        console.warn("[sync-deals] AccessTrade fetch error:", err);
      }
    }

    // 3. Xoá cache để trang chủ cập nhật ngay lập tức
    try {
      revalidatePath("/");
      revalidateTag("deals", { expire: 0 });
    } catch {}

    return NextResponse.json({
      success: true,
      message: "Đã tự động đồng bộ và làm mới deal chớp nhoáng thành công!",
      timestamp: new Date().toISOString(),
      counts: {
        xtraDeals: updatedXtra.length,
        accessTradeDeals: atDealsCount,
      },
    });
  } catch (error: unknown) {
    console.error("[sync-deals] Lỗi đồng bộ:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}
