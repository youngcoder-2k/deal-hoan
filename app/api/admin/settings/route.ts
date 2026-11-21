import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import {
  getBoosterSettings,
  updateBoosterSettings,
  CashbackBoosterSettings,
} from "@/lib/deals/cashback-booster";
import { getReferralSettings, updateReferralSettings } from "@/lib/referral/config";
import type { ReferralSettings } from "@/lib/referral/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/settings
 * Lấy cấu hình tỷ lệ hoàn tiền & cấu hình chương trình giới thiệu hiện tại (Chỉ dành cho Admin)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json(
        { error: "Không có quyền truy cập. Chỉ quản trị viên mới có thể xem cấu hình." },
        { status: 403 }
      );
    }

    const [settings, referralSettings] = await Promise.all([
      getBoosterSettings({ forceRefresh: true }),
      getReferralSettings({ forceRefresh: true }),
    ]);

    return NextResponse.json({
      success: true,
      settings,
      referralSettings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/settings
 * Cập nhật cấu hình tỷ lệ hoàn tiền và/hoặc cấu hình chương trình giới thiệu (Chỉ dành cho Admin)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json(
        { error: "Không có quyền truy cập. Chỉ quản trị viên mới có thể chỉnh sửa cấu hình." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const userEmail = auth.user?.email || "admin";

    let userCashbackPercent: number | undefined = undefined;
    if (typeof body.userCashbackPercent === "number" && !isNaN(body.userCashbackPercent)) {
      userCashbackPercent = Math.max(50.0, Math.min(98.0, Number(body.userCashbackPercent.toFixed(1))));
    } else if (typeof body.safetyMarginPercent === "number" && !isNaN(body.safetyMarginPercent)) {
      userCashbackPercent = Math.max(50.0, Math.min(98.0, Number((100 - body.safetyMarginPercent).toFixed(1))));
    }

    const updatedBooster =
      userCashbackPercent !== undefined
        ? await updateBoosterSettings(
            {
              userCashbackPercent,
              safetyMarginPercent: Number((100 - userCashbackPercent).toFixed(1)),
            } as Partial<CashbackBoosterSettings>,
            userEmail
          )
        : await getBoosterSettings();

    const updatedReferral =
      body.referralSettings && typeof body.referralSettings === "object"
        ? await updateReferralSettings(body.referralSettings as Partial<ReferralSettings>, userEmail)
        : await getReferralSettings();

    return NextResponse.json({
      success: true,
      message: "Đã lưu cấu hình hệ thống thành công.",
      settings: updatedBooster,
      referralSettings: updatedReferral,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
