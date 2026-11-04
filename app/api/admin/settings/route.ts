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
    let userCashbackPercent: number | undefined = undefined;

    if (typeof body.userCashbackPercent === "number" && !isNaN(body.userCashbackPercent)) {
      userCashbackPercent = Math.max(50.0, Math.min(98.0, Number(body.userCashbackPercent.toFixed(1))));
    } else if (typeof body.safetyMarginPercent === "number" && !isNaN(body.safetyMarginPercent)) {
      userCashbackPercent = Math.max(50.0, Math.min(98.0, Number((100 - body.safetyMarginPercent).toFixed(1))));
    }

    const partialSettings: Partial<CashbackBoosterSettings> = {};
    if (userCashbackPercent !== undefined) {
      partialSettings.userCashbackPercent = userCashbackPercent;
      partialSettings.safetyMarginPercent = Number((100 - userCashbackPercent).toFixed(1));
    }

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
