import fs from "fs";
import path from "path";
import { getAdminEmails } from "@/lib/auth/admin";

export interface EmailNotificationSettings {
  /** Mặc định luôn bật gửi email thông báo (có lệnh rút tiền -> báo admin, admin duyệt -> báo user) */
  enabled: boolean;
  /** Địa chỉ email gửi đi (mặc định: dealhoan@gmail.com) */
  senderEmail: string;
  /** Tên hiển thị người gửi */
  senderName: string;
  /** Máy chủ SMTP (mặc định: smtp.gmail.com) */
  smtpHost: string;
  /** Cổng SMTP (465 cho SSL, 587 cho TLS) */
  smtpPort: number;
  /** Sử dụng SSL/TLS an toàn */
  smtpSecure: boolean;
  /** Tên đăng nhập SMTP (dealhoan@gmail.com) */
  smtpUser: string;
  /** Mật khẩu ứng dụng Gmail (16 ký tự) */
  smtpPass: string;
  /** Danh sách email admin nhận thông báo khi có lệnh rút tiền */
  adminEmails: string[];
}

const LEGACY_SETTINGS_FILE_PATH = path.join(process.cwd(), "data", "email-settings.json");

function readFallbackSmtpPassword(): string {
  try {
    if (!fs.existsSync(LEGACY_SETTINGS_FILE_PATH)) return "";
    const raw = fs.readFileSync(LEGACY_SETTINGS_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.smtpPass === "string") {
      return parsed.smtpPass.replace(/\s+/g, "");
    }
  } catch {
    // Ignore missing or unreadable legacy local settings file
  }
  return "";
}

export function getDefaultEmailSettings(): EmailNotificationSettings {
  const envAdminEmails = process.env.ADMIN_NOTIFICATION_EMAILS
    ? process.env.ADMIN_NOTIFICATION_EMAILS.split(",")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"))
    : [];

  const adminList = Array.from(
    new Set(
      [...getAdminEmails(), ...envAdminEmails]
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"))
    )
  );

  const smtpPort = Number(process.env.SMTP_PORT || 465) || 465;
  const smtpUser = (process.env.SMTP_USER || "dealhoan@gmail.com").trim();
  const envPass = (
    process.env.SMTP_PASS ||
    process.env.GMAIL_APP_PASSWORD ||
    process.env.EMAIL_PASSWORD ||
    ""
  ).replace(/\s+/g, "");

  return {
    // Mặc định luôn bật thông báo qua email (không có nút tắt trong UI Admin)
    enabled: process.env.EMAIL_NOTIFICATIONS_ENABLED !== "false",
    senderEmail: smtpUser || "dealhoan@gmail.com",
    senderName: "DealHoàn",
    smtpHost: (process.env.SMTP_HOST || "smtp.gmail.com").trim(),
    smtpPort,
    smtpSecure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE !== "false" : smtpPort === 465,
    smtpUser: smtpUser || "dealhoan@gmail.com",
    smtpPass: envPass || readFallbackSmtpPassword(),
    adminEmails: adminList.length > 0 ? adminList : ["dealhoan@gmail.com"],
  };
}

export function getEmailSettingsSync(): EmailNotificationSettings {
  return getDefaultEmailSettings();
}

export async function getEmailSettings(): Promise<EmailNotificationSettings> {
  return getDefaultEmailSettings();
}
