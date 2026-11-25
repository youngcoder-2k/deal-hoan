import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import { isRioHubConfigured, syncRioHubOrders } from "@/lib/deals/riohub-affiliate";

export const dynamic = "force-dynamic";
export const maxDuration = 150;

export async function GET(request: NextRequest) {
  const auth = await checkAdminApiAuth(request);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const configured = isRioHubConfigured();
  const supabaseAdmin = getSupabaseAdminClient();
  let recentOrders: Record<string, unknown>[] = [];

  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from("cashback_orders")
      .select("*")
      .eq("platform", "TikTok Shop")
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

  const result = await syncRioHubOrders();
  return NextResponse.json(result.body, { status: result.code });
}
