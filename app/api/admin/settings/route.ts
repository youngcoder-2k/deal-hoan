import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import {
  getBoosterSettings,
  updateBoosterSettings,
  CashbackBoosterSettings,
} from "@/lib/deals/cashback-booster";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/settings
 * Lấy cấu hình tỷ lệ hoàn tiền hiện tại (Chỉ dành cho Admin)
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

    const settings = await getBoosterSettings();
    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/settings
 * Cập nhật cấu hình tỷ lệ hoàn tiền và biên an toàn (Chỉ dành cho Admin)
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
    const boostFactor = typeof body.boostFactor === "number" ? Math.max(0, Math.min(2.0, body.boostFactor)) : undefined;
    const maxBonusRate = typeof body.maxBonusRate === "number" ? Math.max(0.1, Math.min(3.0, body.maxBonusRate)) : undefined;
    const minBonusRate = typeof body.minBonusRate === "number" ? Math.max(0.0, Math.min(1.0, body.minBonusRate)) : undefined;
    const safetyMarginPercent = typeof body.safetyMarginPercent === "number" ? Math.max(5.0, Math.min(40.0, body.safetyMarginPercent)) : undefined;
    const autoScaleWithUsers = typeof body.autoScaleWithUsers === "boolean" ? body.autoScaleWithUsers : undefined;

    const partialSettings: Partial<CashbackBoosterSettings> = {};
    if (boostFactor !== undefined) partialSettings.boostFactor = boostFactor;
    if (maxBonusRate !== undefined) partialSettings.maxBonusRate = maxBonusRate;
    if (minBonusRate !== undefined) partialSettings.minBonusRate = minBonusRate;
    if (safetyMarginPercent !== undefined) partialSettings.safetyMarginPercent = safetyMarginPercent;
    if (autoScaleWithUsers !== undefined) partialSettings.autoScaleWithUsers = autoScaleWithUsers;

    const userEmail = auth.user?.email || "admin";
    const updated = await updateBoosterSettings(partialSettings, userEmail);

    return NextResponse.json({
      success: true,
      message: "Đã cập nhật cấu hình tỷ lệ hoàn tiền thành công.",
      settings: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
