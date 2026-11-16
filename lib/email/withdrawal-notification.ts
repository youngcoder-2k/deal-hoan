import nodemailer from "nodemailer";
import { getEmailSettings, EmailNotificationSettings } from "./email-config";

export interface WithdrawalAlertData {
  withdrawalId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  userRefCode?: string;
  amount: number;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  createdAt?: string;
  note?: string | null;
}

function formatVnd(amount: number): string {
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("vi-VN")}đ`;
  }
}

function formatVietnamTime(isoDate?: string): string {
  try {
    const d = isoDate ? new Date(isoDate) : new Date();
    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour12: false,
    }).format(d);
  } catch {
    return isoDate || new Date().toLocaleString("vi-VN");
  }
}

function getSiteUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://dealhoan.vn");
  return url.replace(/\/+$/, "");
}

function createTransporter(settings: EmailNotificationSettings) {
  const isSsl = settings.smtpPort === 465;

  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: isSsl,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  });
}

function buildHtmlTemplate(data: WithdrawalAlertData, adminUrl: string): string {
  const formattedAmount = formatVnd(data.amount);
  const timeStr = formatVietnamTime(data.createdAt);
  const displayName = data.userName || data.userEmail || "Người dùng DealHoàn";
  const userRef = data.userRefCode || `u_${data.userId.slice(0, 8)}`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thông Báo Rút Tiền DealHoàn</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f4f6f8;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f4f6f8;
      padding: 32px 16px;
      box-sizing: border-box;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #ee4c23 0%, #ff6b3d 100%);
      padding: 24px 28px;
      text-align: center;
      color: #ffffff;
    }
    .header-logo {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin: 0;
      display: inline-block;
    }
    .header-sub {
      margin: 6px 0 0;
      font-size: 13px;
      opacity: 0.92;
      font-weight: 500;
    }
    .content {
      padding: 28px;
    }
    .badge-alert {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background-color: #fff7ed;
      border: 1px solid #ffedd5;
      color: #c2410c;
      font-size: 13px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 9999px;
      margin-bottom: 20px;
    }
    .amount-box {
      background-color: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 12px;
      padding: 18px 20px;
      text-align: center;
      margin-bottom: 24px;
    }
    .amount-label {
      font-size: 12px;
      color: #15803d;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 4px;
    }
    .amount-value {
      font-size: 32px;
      font-weight: 800;
      color: #16a34a;
      letter-spacing: -1px;
      margin: 0;
    }
    .card {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 20px;
    }
    .card-title {
      font-size: 13px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 12px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      font-size: 14px;
    }
    .info-label {
      color: #64748b;
      font-weight: 500;
    }
    .info-value {
      color: #0f172a;
      font-weight: 600;
      text-align: right;
    }
    .account-no {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #e2e8f0;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 14px;
      letter-spacing: 1px;
      color: #0f172a;
    }
    .btn-action {
      display: block;
      width: 100%;
      box-sizing: border-box;
      background-color: #ee4c23;
      color: #ffffff !important;
      text-align: center;
      padding: 14px 20px;
      border-radius: 10px;
      text-decoration: none;
      font-size: 15px;
      font-weight: 700;
      margin: 24px 0 12px;
      box-shadow: 0 4px 12px rgba(238, 76, 35, 0.25);
    }
    .footer {
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 18px 28px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1 class="header-logo">DealHoàn</h1>
        <p class="header-sub">Hệ Thống Quản Trị Hoàn Tiền Mua Sắm</p>
      </div>
      
      <div class="content">
        <div style="text-align: center;">
          <div class="badge-alert">
            ⚡ Lệnh Rút Tiền Mới Cần Xử Lý
          </div>
        </div>

        <div class="amount-box">
          <div class="amount-label">Số Tiền Yêu Cầu Rút</div>
          <div class="amount-value">${formattedAmount}</div>
        </div>

        <div class="card">
          <div class="card-title">Thông Tin Người Yêu Cầu</div>
          <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 14px;">
            <tr>
              <td style="color: #64748b; font-weight: 500;">Họ và tên:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 600;">${displayName}</td>
            </tr>
            ${
              data.userEmail
                ? `<tr>
              <td style="color: #64748b; font-weight: 500;">Email:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 600;">${data.userEmail}</td>
            </tr>`
                : ""
            }
            <tr>
              <td style="color: #64748b; font-weight: 500;">Mã tài khoản:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 600;">${userRef}</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Thời gian gửi:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 600;">${timeStr}</td>
            </tr>
          </table>
        </div>

        <div class="card">
          <div class="card-title">Tài Khoản Nhận Tiền (Napas247)</div>
          <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 14px;">
            <tr>
              <td style="color: #64748b; font-weight: 500;">Ngân hàng:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 700;">${data.bankName}</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Số tài khoản:</td>
              <td style="text-align: right;">
                <span class="account-no">${data.bankAccountNo}</span>
              </td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Tên chủ tài khoản:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 700; text-transform: uppercase;">
                ${data.bankAccountName}
              </td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Mã lệnh rút:</td>
              <td style="text-align: right; color: #64748b; font-size: 12px; font-family: monospace;">
                #${data.withdrawalId.slice(0, 16)}
              </td>
            </tr>
          </table>
        </div>

        <a href="${adminUrl}" class="btn-action" target="_blank">
          👉 Vào Trang Quản Trị Duyệt Lệnh Rút Tiền
        </a>

        <p style="text-align: center; margin: 12px 0 0; font-size: 12px; color: #94a3b8;">
          Hoặc mở trình duyệt truy cập: <a href="${adminUrl}" style="color: #ee4c23;">${adminUrl}</a>
        </p>
      </div>

      <div class="footer">
        Email thông báo tự động từ hệ thống DealHoàn (&lt;dealhoan@gmail.com&gt;).<br>
        Thông báo được gửi tới Ban Quản Trị để đối soát và xử lý lệnh giải ngân.
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildPlainText(data: WithdrawalAlertData, adminUrl: string): string {
  const formattedAmount = formatVnd(data.amount);
  const timeStr = formatVietnamTime(data.createdAt);
  const displayName = data.userName || data.userEmail || "Người dùng DealHoàn";

  return `[DEALHOÀN] YÊU CẦU RÚT TIỀN MỚI CẦN DUYỆT

Số tiền yêu cầu: ${formattedAmount}
Thời gian gửi: ${timeStr}

THÔNG TIN NGƯỜI RÚT:
- Họ tên: ${displayName}
- Email: ${data.userEmail || "Chưa cập nhật"}
- Mã User: ${data.userId}

THÔNG TIN TÀI KHOẢN NHẬN TIỀN:
- Ngân hàng: ${data.bankName}
- Số tài khoản: ${data.bankAccountNo}
- Tên tài khoản: ${data.bankAccountName}
- Mã lệnh: ${data.withdrawalId}

Vui lòng truy cập trang quản trị để kiểm tra và duyệt giải ngân:
${adminUrl}

---
Email được gửi tự động từ dealhoan@gmail.com`;
}

/**
 * Gửi email thông báo cho tất cả Admin khi có người dùng gửi lệnh rút tiền mới.
 * Hàm này an toàn (safe non-blocking) — không bao giờ ném ngoại lệ làm gián đoạn luồng rút tiền.
 */
export async function sendWithdrawalAlertToAdmins(
  data: WithdrawalAlertData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const settings = await getEmailSettings();

    if (!settings.enabled) {
      console.log("[Email Notification] Bỏ qua gửi email: Tính năng thông báo đang tắt.");
      return { success: false, error: "Email notification is disabled" };
    }

    if (!settings.smtpPass) {
      console.warn(
        `[Email Notification] Chưa cấu hình SMTP_PASS hoặc Mật khẩu ứng dụng Gmail cho ${settings.senderEmail}. Vui lòng cấu hình trên trang Admin hoặc file .env.`
      );
      return { success: false, error: "Missing SMTP password / Gmail app password" };
    }

    const recipients = settings.adminEmails.filter((e) => e && e.includes("@"));
    if (recipients.length === 0) {
      console.warn("[Email Notification] Không có địa chỉ email admin nào nhận thông báo.");
      return { success: false, error: "No admin recipient emails configured" };
    }

    const transporter = createTransporter(settings);
    const siteUrl = getSiteUrl();
    const adminUrl = `${siteUrl}/admin?tab=withdrawals`;

    const formattedAmount = formatVnd(data.amount);
    const subject = `[DealHoàn] Có yêu cầu rút tiền mới: ${formattedAmount} từ ${data.userName || data.bankAccountName || "Khách hàng"}`;

    const mailOptions = {
      from: `"${settings.senderName}" <${settings.senderEmail}>`,
      to: recipients.join(", "),
      subject,
      text: buildPlainText(data, adminUrl),
      html: buildHtmlTemplate(data, adminUrl),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `[Email Notification] ✅ Đã gửi email thông báo rút tiền tới [${recipients.join(
        ", "
      )}] - MessageId: ${info.messageId}`
    );

    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Email Notification] ❌ Lỗi khi gửi email thông báo rút tiền:", errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Gửi email thử nghiệm từ dealhoan@gmail.com để kiểm tra cấu hình SMTP và Mật khẩu ứng dụng Gmail.
 */
export async function testEmailConnection(
  targetEmail?: string
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const settings = await getEmailSettings();

    if (!settings.smtpPass) {
      return {
        success: false,
        message: "Chưa cấu hình Mật khẩu ứng dụng Gmail (App Password).",
        error: "Missing SMTP password",
      };
    }

    const recipients = targetEmail
      ? [targetEmail]
      : settings.adminEmails.filter((e) => e && e.includes("@"));

    if (recipients.length === 0) {
      return {
        success: false,
        message: "Không tìm thấy địa chỉ email admin hợp lệ để nhận thử nghiệm.",
        error: "No recipient",
      };
    }

    const transporter = createTransporter(settings);

    // 1. Kiểm tra kết nối SMTP handshake
    await transporter.verify();

    // 2. Gửi thử 1 email test
    const siteUrl = getSiteUrl();
    const timeStr = formatVietnamTime();

    const info = await transporter.sendMail({
      from: `"${settings.senderName}" <${settings.senderEmail}>`,
      to: recipients.join(", "),
      subject: `[DealHoàn] Thử nghiệm kết nối Email thành công (${timeStr})`,
      text: `Xin chào Admin,\n\nĐây là email kiểm tra kết nối từ hệ thống DealHoàn (${settings.senderEmail}). Cấu hình SMTP Gmail hoạt động bình thường!\n\nHệ thống sẽ tự động gửi thông báo đến bạn mỗi khi có người dùng gửi lệnh rút tiền mới.\n\nTrang quản trị: ${siteUrl}/admin`,
      html: `<div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff;">
        <h2 style="color: #ee4c23; margin-top: 0;">🎉 Kết Nối Email DealHoàn Thành Công!</h2>
        <p style="font-size: 14px; color: #334155;">Đây là email thử nghiệm gửi từ <strong>${settings.senderEmail}</strong> đến Ban Quản Trị.</p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 14px; border-radius: 8px; color: #16a34a; font-size: 13px; font-weight: 600; margin: 16px 0;">
          ✓ Máy chủ SMTP Gmail xác thực thành công lúc: ${timeStr}
        </div>
        <p style="font-size: 13px; color: #64748b;">Từ giờ, mỗi khi người dùng gửi yêu cầu rút tiền mới, hệ thống sẽ tự động gửi email chi tiết vào hòm thư này để bạn duyệt ngay.</p>
        <a href="${siteUrl}/admin" style="display: inline-block; background: #ee4c23; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-top: 10px;">Vào Dashboard Admin</a>
      </div>`,
    });

    return {
      success: true,
      message: `Đã gửi email thử nghiệm thành công tới: ${recipients.join(", ")}`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Không thể kết nối tới Gmail SMTP: ${errorMsg}`,
      error: errorMsg,
    };
  }
}
