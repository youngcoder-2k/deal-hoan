import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/api/response";
import { recordUserDeviceSignal } from "@/lib/referral/service";
import { extractClientIp } from "@/lib/referral/anti-fraud";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return NextResponse.json({ ok: false });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = (await parseJsonBody<Record<string, unknown>>(request)) || {};
    const deviceId = String(body.deviceId || request.cookies.get("dh_did")?.value || "").trim();
    const fingerprintHash = String(body.fingerprintHash || request.cookies.get("dh_fp")?.value || "").trim();
    const ip = extractClientIp(request.headers);
    const userAgent = request.headers.get("user-agent") || "";

    const recorded = await recordUserDeviceSignal({
      userId: user.id,
      deviceId,
      fingerprintHash,
      ip,
      userAgent,
    });

    return NextResponse.json({ ok: recorded });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
