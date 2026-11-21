import { createHash } from "node:crypto";

/**
 * Chuẩn hóa email để chống thủ thuật tạo nhiều tài khoản từ 1 hộp thư:
 * - Gmail / Googlemail: bỏ dấu chấm (.) trong phần tên và bỏ hậu tố +alias.
 * - Các domain khác: bỏ hậu tố +alias và chuyển thường.
 */
export function normalizeEmailForFraudCheck(email?: string | null): string {
  if (!email) return "";
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0) return trimmed;

  let local = trimmed.slice(0, atIndex);
  let domain = trimmed.slice(atIndex + 1);

  if (domain === "googlemail.com") {
    domain = "gmail.com";
  }

  const plusIdx = local.indexOf("+");
  if (plusIdx !== -1) {
    local = local.slice(0, plusIdx);
  }

  if (domain === "gmail.com") {
    local = local.replace(/\./g, "");
  }

  return `${local}@${domain}`;
}

/**
 * Băm SHA-256 tín hiệu nhạy cảm (IP, fingerprint) với salt ứng dụng để lưu trữ an toàn & so khớp nhanh.
 */
export function hashSignal(raw?: string | null, namespace = "dealhoan"): string {
  const clean = (raw || "").trim();
  if (!clean) return "";
  const salt = process.env.REFERRAL_SIGNAL_SALT || process.env.ADMIN_SECRET_KEY || "dealhoan_antifraud_v1";
  return createHash("sha256").update(`${namespace}:${salt}:${clean}`).digest("hex");
}

/**
 * Trích xuất IP thật của người dùng từ các header chuẩn (Vercel / Cloudflare / Reverse Proxy).
 */
export function extractClientIp(headers: Headers): string {
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-forwarded-for"),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const first = candidate.split(",")[0]?.trim();
    if (first && first.length <= 64) {
      return first;
    }
  }
  return "";
}

/**
 * Chuẩn hóa mã giới thiệu (chấp nhận u_xxxxxxxx, dh..., hoặc UUID đầy đủ).
 */
export function normalizeRefCode(raw?: string | null): string {
  if (!raw) return "";
  return raw.trim().replace(/^@+/, "").slice(0, 64);
}

/**
 * Chuẩn hóa số tài khoản ngân hàng (chỉ giữ lại chữ số để so khớp chính xác).
 */
export function normalizeBankAccountNo(raw?: string | null): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

/**
 * Ẩn bớt email/tên để hiển thị lịch sự, bảo vệ quyền riêng tư trong tab Giới thiệu.
 */
export function maskDisplayIdentity(name?: string | null, email?: string | null): string {
  const cleanName = (name || "").trim();
  if (cleanName && cleanName.length >= 2) {
    const parts = cleanName.split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0]} ${parts[parts.length - 1].slice(0, 1)}***`;
    }
    return `${cleanName.slice(0, 2)}***`;
  }
  const cleanEmail = (email || "").trim();
  if (cleanEmail.includes("@")) {
    const [local, domain] = cleanEmail.split("@");
    const visible = local.slice(0, Math.min(3, local.length));
    return `${visible}***@${domain}`;
  }
  return "Thành viên DealHoàn";
}

/**
 * Validate device_id gửi từ client (chỉ chấp nhận chuỗi an toàn, độ dài hợp lý).
 */
export function sanitizeDeviceId(raw?: string | null): string {
  if (!raw) return "";
  const clean = raw.trim();
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(clean)) return "";
  return clean;
}

/**
 * Validate fingerprint hash SHA-256 hex gửi từ client.
 */
export function sanitizeFingerprintHash(raw?: string | null): string {
  if (!raw) return "";
  const clean = raw.trim().toLowerCase();
  if (!/^[0-9a-f]{16,128}$/.test(clean)) return "";
  return clean;
}
