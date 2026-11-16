import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import {
  getBoosterSettings,
  updateBoosterSettings,
  CashbackBoosterSettings,
} from "@/lib/deals/cashback-booster";
import {
  getEmailSettings,
  updateEmailSettings,
  maskEmailSettings,
  EmailNotificationSettings,
} from "@/lib/email/email-config";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/settings
 * Lấy cấu hình tỷ lệ hoàn tiền và cấu hình email thông báo hiện tại (Chỉ dành cho Admin)
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

    const [settings, rawEmailSettings] = await Promise.all([
      getBoosterSettings(),
      getEmailSettings(),
    ]);

    return NextResponse.json({
      success: true,
      settings,
      emailSettings: maskEmailSettings(rawEmailSettings),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/settings
 * Cập nhật cấu hình tỷ lệ hoàn tiền và/hoặc cấu hình gửi email thông báo (Chỉ dành cho Admin)
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

    let updatedBooster = undefined;
    let updatedEmail = undefined;

    // 1. Cập nhật Email Settings nếu có truyền vào
    if (body.emailSettings && typeof body.emailSettings === "object") {
      const emailPayload = body.emailSettings as Partial<EmailNotificationSettings>;
      updatedEmail = await updateEmailSettings(emailPayload, userEmail);
    }

    // 2. Cập nhật Booster Settings nếu có truyền vào
    let userCashbackPercent: number | undefined = undefined;
    if (typeof body.userCashbackPercent === "number" && !isNaN(body.userCashbackPercent)) {
      userCashbackPercent = Math.max(50.0, Math.min(98.0, Number(body.userCashbackPercent.toFixed(1))));
    } else if (typeof body.safetyMarginPercent === "number" && !isNaN(body.safetyMarginPercent)) {
      userCashbackPercent = Math.max(50.0, Math.min(98.0, Number((100 - body.safetyMarginPercent).toFixed(1))));
    }

    if (userCashbackPercent !== undefined) {
      const partialSettings: Partial<CashbackBoosterSettings> = {
        userCashbackPercent,
        safetyMarginPercent: Number((100 - userCashbackPercent).toFixed(1)),
      };
      updatedBooster = await updateBoosterSettings(partialSettings, userEmail);
    } else {
      updatedBooster = await getBoosterSettings();
    }

    const finalEmail = updatedEmail ? updatedEmail : await getEmailSettings();

    return NextResponse.json({
      success: true,
      message: "Đã cập nhật cấu hình hệ thống thành công.",
      settings: updatedBooster,
      emailSettings: maskEmailSettings(finalEmail),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
