import fs from "fs";
import path from "path";
import { getAdminEmails } from "@/lib/auth/admin";

export interface EmailNotificationSettings {
  /** Bật/tắt gửi email thông báo khi có lệnh rút tiền */
  enabled: boolean;
  /** Địa chỉ email gửi đi (dealhoan@gmail.com) */
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
  smtpPass?: string;
  /** Danh sách email admin nhận thông báo khi có lệnh rút tiền */
  adminEmails: string[];
  /** Thời gian cập nhật */
  updatedAt?: string;
  /** Người cập nhật */
  updatedBy?: string;
}

export interface PublicEmailSettings {
  enabled: boolean;
  senderEmail: string;
  senderName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  hasPassword: boolean;
  adminEmails: string[];
  updatedAt?: string;
  updatedBy?: string;
}

const SETTINGS_FILE_PATH = path.join(process.cwd(), "data", "email-settings.json");

export function getDefaultEmailSettings(): EmailNotificationSettings {
  const envAdminEmails = process.env.ADMIN_NOTIFICATION_EMAILS
    ? process.env.ADMIN_NOTIFICATION_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];

  const adminList = Array.from(
    new Set([...getAdminEmails(), ...envAdminEmails].map((e) => e.toLowerCase()))
  );

  return {
    enabled: process.env.EMAIL_NOTIFICATIONS_ENABLED !== "false",
    senderEmail: "dealhoan@gmail.com",
    senderName: "DealHoàn",
    smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpSecure: process.env.SMTP_SECURE !== "false",
    smtpUser: process.env.SMTP_USER || "dealhoan@gmail.com",
    smtpPass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASSWORD || "",
    adminEmails: adminList.length > 0 ? adminList : ["dealhoan@gmail.com"],
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
  };
}

let cachedSettings: EmailNotificationSettings | null = null;

export function normalizeEmailSettings(
  raw?: Partial<EmailNotificationSettings>
): EmailNotificationSettings {
  const defaults = getDefaultEmailSettings();
  if (!raw) return defaults;

  let adminList = Array.isArray(raw.adminEmails)
    ? raw.adminEmails.map((e) => String(e).trim().toLowerCase()).filter((e) => e.includes("@"))
    : defaults.adminEmails;

  if (adminList.length === 0) {
    adminList = defaults.adminEmails;
  }

  const port = Number(raw.smtpPort) || defaults.smtpPort;

  return {
    ...defaults,
    ...raw,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : defaults.enabled,
    senderEmail: "dealhoan@gmail.com",
    senderName: raw.senderName?.trim() || defaults.senderName,
    smtpHost: raw.smtpHost?.trim() || defaults.smtpHost,
    smtpPort: port,
    smtpSecure: typeof raw.smtpSecure === "boolean" ? raw.smtpSecure : port === 465,
    smtpUser: raw.smtpUser?.trim() || defaults.smtpUser,
    smtpPass: typeof raw.smtpPass === "string" ? raw.smtpPass.replace(/\s+/g, "") : (defaults.smtpPass ? defaults.smtpPass.replace(/\s+/g, "") : ""),
    adminEmails: Array.from(new Set(adminList)),
  };
}

export function getEmailSettingsSync(): EmailNotificationSettings {
  if (cachedSettings) return cachedSettings;

  try {
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      const raw = fs.readFileSync(SETTINGS_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      cachedSettings = normalizeEmailSettings(parsed);
      // Nếu file chưa có password mà env có password thì ưu tiên env
      if (!cachedSettings.smtpPass && (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD)) {
        cachedSettings.smtpPass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "").trim();
      }
      return cachedSettings;
    }
  } catch (err) {
    console.warn("Failed to read email-settings.json, using defaults:", err);
  }

  cachedSettings = getDefaultEmailSettings();
  return cachedSettings;
}

export async function getEmailSettings(): Promise<EmailNotificationSettings> {
  return getEmailSettingsSync();
}

export async function updateEmailSettings(
  partial: Partial<EmailNotificationSettings>,
  updatedBy = "admin"
): Promise<EmailNotificationSettings> {
  const current = getEmailSettingsSync();
  const nextPass =
    typeof partial.smtpPass === "string" && partial.smtpPass.trim() !== ""
      ? partial.smtpPass.trim()
      : current.smtpPass;

  const next = normalizeEmailSettings({
    ...current,
    ...partial,
    smtpPass: nextPass,
    updatedAt: new Date().toISOString(),
    updatedBy,
  });

  cachedSettings = next;

  try {
    const dir = path.dirname(SETTINGS_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(next, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to write email-settings.json:", err);
  }

  return next;
}

export function maskEmailSettings(settings: EmailNotificationSettings): PublicEmailSettings {
  return {
    enabled: settings.enabled,
    senderEmail: settings.senderEmail,
    senderName: settings.senderName,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    smtpUser: settings.smtpUser,
    hasPassword: Boolean(settings.smtpPass && settings.smtpPass.length > 0),
    adminEmails: settings.adminEmails,
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
}
