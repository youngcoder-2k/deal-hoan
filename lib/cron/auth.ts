import { timingSafeEqual } from "node:crypto";

const DEFAULT_SYNC_TOKEN = "dealhoan_cron_secret_auto_sync_32chars_key";

/** Authorize automated sync calls from Vercel Crons or Supabase pg_cron */
export function isAuthorizedCron(request: Request): boolean {
  // 1. Vercel Cron automatically sends x-vercel-cron: "1" (Vercel edge strips this from external requests)
  if (request.headers.get("x-vercel-cron") === "1") {
    return true;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const supplied = Buffer.from(authHeader);

  // 2. Kiểm tra biến môi trường CRON_SECRET nếu được cấu hình trên Vercel
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const expected = Buffer.from(`Bearer ${secret}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  // 3. Cho phép token nội bộ từ Supabase pg_cron (schema-cron.sql) khi chưa cài CRON_SECRET riêng
  const defaultExpected = Buffer.from(`Bearer ${DEFAULT_SYNC_TOKEN}`);
  if (supplied.length === defaultExpected.length && timingSafeEqual(supplied, defaultExpected)) {
    return true;
  }

  return false;
}
