import { NextResponse } from "next/server";

/**
 * An toàn phản hồi lỗi API: Trong môi trường production, tuyệt đối không trả về
 * message/stack trace nội bộ của cơ sở dữ liệu hay mã nguồn cho người dùng bên ngoài,
 * chống dịch ngược (Reverse Engineering) và rò rỉ cấu trúc hệ thống.
 */
export function handleApiError(
  err: unknown,
  fallbackMessage = "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
  statusCode = 500
): NextResponse {
  console.error("[API Unhandled Error]:", err);
  const isDev = process.env.NODE_ENV !== "production";
  const message = isDev && err instanceof Error ? err.message : fallbackMessage;
  return NextResponse.json({ error: message }, { status: statusCode });
}

/**
 * Trích xuất an toàn JSON body: Ngăn ngừa lỗi unhandled SyntaxError dẫn tới 500 khi body rỗng
 * hoặc payload không hợp lệ từ các công cụ fuzzing / REA.
 */
export async function parseJsonBody<T = Record<string, unknown>>(
  request: Request
): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
