import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserReferralSummary } from "@/lib/referral/service";
import { handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Chưa cấu hình hệ thống xác thực." }, { status: 503 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Vui lòng đăng nhập để xem thông tin giới thiệu." }, { status: 401 });
    }

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    const origin = host ? `${proto}://${host}` : undefined;

    const summary = await getUserReferralSummary(user.id, origin);
    return NextResponse.json({ success: true, ...summary });
  } catch (err: unknown) {
    return handleApiError(err, "Không thể tải dữ liệu giới thiệu.");
  }
}
