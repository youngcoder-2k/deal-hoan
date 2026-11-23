import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import {
  isLazadaAffiliateConfigured,
  syncLazadaOrders,
} from "@/lib/deals/lazada-affiliate";

export const dynamic = "force-dynamic";
export const maxDuration = 150;

export async function GET(request: NextRequest) {
  const auth = await checkAdminApiAuth(request);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const configured = isLazadaAffiliateConfigured();
  const supabaseAdmin = getSupabaseAdminClient();
  let recentOrders: Record<string, unknown>[] = [];

  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from("cashback_orders")
      .select("*")
      .eq("platform", "Lazada")
      .order("ordered_at", { ascending: false })
      .limit(100);
    recentOrders = Array.isArray(data) ? data : [];
  }

  return NextResponse.json({
    success: true,
    configured,
    recentOrders,
  });
}

export async function POST(request: NextRequest) {
  const auth = await checkAdminApiAuth(request);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "Không có quyền thực hiện. Yêu cầu quyền Admin." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const daysBack =
    typeof body.daysBack === "number" && Number.isFinite(body.daysBack)
      ? Math.max(1, Math.min(90, Math.round(body.daysBack)))
      : 30;

  const result = await syncLazadaOrders({ daysBack });
  return NextResponse.json(result.body, { status: result.code });
}
