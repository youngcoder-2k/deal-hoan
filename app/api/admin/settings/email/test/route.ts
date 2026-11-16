import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import { testEmailConnection } from "@/lib/email/withdrawal-notification";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json(
        { error: "Không có quyền truy cập. Chỉ quản trị viên mới có thể thử nghiệm email." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const targetEmail = typeof body.targetEmail === "string" && body.targetEmail.includes("@")
      ? body.targetEmail.trim()
      : undefined;

    const result = await testEmailConnection(targetEmail);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.message || "Gửi email thử nghiệm thất bại.",
          details: result.error,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
