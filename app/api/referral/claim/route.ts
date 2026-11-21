import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseJsonBody, handleApiError } from "@/lib/api/response";
import { claimReferralForUser } from "@/lib/referral/service";
import { extractClientIp } from "@/lib/referral/anti-fraud";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Hệ thống chưa kết nối cơ sở dữ liệu." }, { status: 503 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Vui lòng đăng nhập để áp dụng mã giới thiệu." }, { status: 401 });
    }

    const body = (await parseJsonBody<Record<string, unknown>>(request)) || {};
    const refCode = String(body.refCode || request.cookies.get("dh_ref")?.value || "").trim();
    const deviceId = String(body.deviceId || request.cookies.get("dh_did")?.value || "").trim();
    const fingerprintHash = String(body.fingerprintHash || request.cookies.get("dh_fp")?.value || "").trim();
    const ip = extractClientIp(request.headers);
    const userAgent = request.headers.get("user-agent") || "";

    if (!refCode) {
      return NextResponse.json({ error: "Vui lòng nhập mã giới thiệu." }, { status: 400 });
    }

    const result = await claimReferralForUser({
      refereeId: user.id,
      refereeEmail: user.email,
      refCode,
      deviceId,
      fingerprintHash,
      ip,
      userAgent,
    });

    if (!result.success) {
      const status =
        result.code === "already_referred" ||
        result.code === "self_referral_not_allowed" ||
        result.code === "reciprocal_referral_not_allowed" ||
        result.code === "same_device_detected" ||
        result.code === "same_device_fingerprint_detected" ||
        result.code === "device_already_claimed_referral" ||
        result.code === "fingerprint_already_claimed_referral" ||
        result.code === "missing_device_signal" ||
        result.code === "duplicate_email_self" ||
        result.code === "duplicate_email_already_claimed" ||
        result.code === "existing_orders_not_eligible" ||
        result.code === "existing_wallet_activity_not_eligible" ||
        result.code === "account_too_old_for_referral" ||
        result.code === "referrer_not_found" ||
        result.code === "referral_disabled"
          ? 400
          : 500;

      const response = NextResponse.json(
        { success: false, code: result.code, error: result.error },
        { status }
      );
      if (
        status === 400 &&
        result.code !== "referrer_not_found" &&
        result.code !== "missing_device_signal"
      ) {
        response.cookies.set("dh_ref", "", { path: "/", maxAge: 0 });
      }
      return response;
    }

    const response = NextResponse.json({
      success: true,
      message: `Áp dụng mã thành công! Bạn được cộng ${Number(
        result.referral?.referee_reward || 10000
      ).toLocaleString("vi-VN")}đ vào số dư Đang khóa.`,
      referral: result.referral,
    });
    response.cookies.set("dh_ref", "", { path: "/", maxAge: 0 });
    return response;
  } catch (err: unknown) {
    return handleApiError(err, "Không thể áp dụng mã giới thiệu lúc này.");
  }
}
