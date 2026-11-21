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

export interface UserWithdrawalSuccessAlertData {
  withdrawalId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  amount: number;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  completedAt?: string;
  note?: string | null;
}

export interface UserWithdrawalReceiptData {
  withdrawalId: string;
  userId: string;
  userEmail: string;
  userName?: string;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const formattedAmount = escapeHtml(formatVnd(data.amount));
  const timeStr = escapeHtml(formatVietnamTime(data.createdAt));
  const displayName = escapeHtml(data.userName || data.userEmail || "Người dùng DealHoàn");
  const userEmail = data.userEmail ? escapeHtml(data.userEmail) : "";
  const userRef = escapeHtml(data.userRefCode || `u_${data.userId.slice(0, 8)}`);
  const bankName = escapeHtml(data.bankName);
  const bankAccountNo = escapeHtml(data.bankAccountNo);
  const bankAccountName = escapeHtml(data.bankAccountName);
  const shortWithdrawalId = escapeHtml(data.withdrawalId.slice(0, 16));
  const safeAdminUrl = escapeHtml(adminUrl);

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
              userEmail
                ? `<tr>
              <td style="color: #64748b; font-weight: 500;">Email:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 600;">${userEmail}</td>
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
              <td style="text-align: right; color: #0f172a; font-weight: 700;">${bankName}</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Số tài khoản:</td>
              <td style="text-align: right;">
                <span class="account-no">${bankAccountNo}</span>
              </td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Tên chủ tài khoản:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 700; text-transform: uppercase;">
                ${bankAccountName}
              </td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Mã lệnh rút:</td>
              <td style="text-align: right; color: #64748b; font-size: 12px; font-family: monospace;">
                #${shortWithdrawalId}
              </td>
            </tr>
          </table>
        </div>

        <a href="${safeAdminUrl}" class="btn-action" target="_blank">
          👉 Vào Trang Quản Trị Duyệt Lệnh Rút Tiền
        </a>

        <p style="text-align: center; margin: 12px 0 0; font-size: 12px; color: #94a3b8;">
          Hoặc mở trình duyệt truy cập: <a href="${safeAdminUrl}" style="color: #ee4c23;">${safeAdminUrl}</a>
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
        `[Email Notification] Chưa cấu hình biến môi trường SMTP_PASS hoặc GMAIL_APP_PASSWORD cho ${settings.senderEmail}.`
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

function buildUserSuccessHtml(data: UserWithdrawalSuccessAlertData, siteUrl: string): string {
  const formattedAmount = escapeHtml(formatVnd(data.amount));
  const timeStr = escapeHtml(formatVietnamTime(data.completedAt));
  const displayName = escapeHtml(data.userName || data.bankAccountName || "Bạn");
  const bankName = escapeHtml(data.bankName);
  const bankAccountNo = escapeHtml(data.bankAccountNo);
  const bankAccountName = escapeHtml(data.bankAccountName);
  const shortWithdrawalId = escapeHtml(data.withdrawalId.slice(0, 16));
  const safeSiteUrl = escapeHtml(siteUrl);

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rút Tiền Thành Công - DealHoàn</title>
  <style>
    body {
      margin: 0; padding: 0; background-color: #f4f6f8;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b; -webkit-font-smoothing: antialiased;
    }
    .wrapper { width: 100%; background-color: #f4f6f8; padding: 32px 16px; box-sizing: border-box; }
    .container {
      max-width: 580px; margin: 0 auto; background-color: #ffffff;
      border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #109452 0%, #059669 100%);
      padding: 24px 28px; text-align: center; color: #ffffff;
    }
    .header-logo { font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
    .header-sub { margin: 6px 0 0; font-size: 13px; opacity: 0.95; font-weight: 500; }
    .content { padding: 28px; }
    .badge-success {
      display: inline-flex; align-items: center; gap: 6px;
      background-color: #ecfdf5; border: 1px solid #a7f3d0; color: #047857;
      font-size: 13px; font-weight: 700; padding: 6px 14px; border-radius: 9999px;
      margin-bottom: 20px;
    }
    .amount-box {
      background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;
      padding: 20px; text-align: center; margin-bottom: 24px;
    }
    .amount-label { font-size: 12px; color: #15803d; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px; }
    .amount-value { font-size: 34px; font-weight: 800; color: #16a34a; letter-spacing: -1px; margin: 0; }
    .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px; }
    .card-title { font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
    .account-no { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: #e2e8f0; padding: 3px 8px; border-radius: 6px; font-size: 14px; font-weight: 700; color: #0f172a; }
    .btn-action {
      display: block; width: 100%; box-sizing: border-box; background-color: #ee4c23;
      color: #ffffff !important; text-align: center; padding: 14px 20px; border-radius: 10px;
      text-decoration: none; font-size: 15px; font-weight: 700; margin: 24px 0 12px;
      box-shadow: 0 4px 12px rgba(238, 76, 35, 0.25);
    }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 28px; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1 class="header-logo">DealHoàn</h1>
        <p class="header-sub">Thông Báo Chuyển Tiền Thành Công</p>
      </div>

      <div class="content">
        <div style="text-align: center;">
          <div class="badge-success">
            ✓ Giao Dịch Chuyển Tiền Đã Hoàn Tất
          </div>
        </div>

        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
          Xin chào <strong>${displayName}</strong>,<br>
          Yêu cầu rút tiền hoàn của bạn đã được Admin DealHoàn <strong>phê duyệt và chuyển khoản thành công</strong> qua hệ thống liên ngân hàng Napas247!
        </p>

        <div class="amount-box">
          <div class="amount-label">Số Tiền Đã Chuyển Về Tài Khoản</div>
          <div class="amount-value">+${formattedAmount}</div>
        </div>

        <div class="card">
          <div class="card-title">Chi Tiết Tài Khoản Nhận Tiền</div>
          <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 14px;">
            <tr>
              <td style="color: #64748b; font-weight: 500;">Ngân hàng thụ hưởng:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 700;">${bankName}</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Số tài khoản:</td>
              <td style="text-align: right;">
                <span class="account-no">${bankAccountNo}</span>
              </td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Tên chủ tài khoản:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 700; text-transform: uppercase;">
                ${bankAccountName}
              </td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Thời gian xử lý:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 600;">${timeStr}</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Mã giao dịch:</td>
              <td style="text-align: right; color: #64748b; font-size: 12px; font-family: monospace;">
                #${shortWithdrawalId}
              </td>
            </tr>
          </table>
        </div>

        <a href="${safeSiteUrl}" class="btn-action" target="_blank">
          👉 Mở Ví DealHoàn Kiểm Tra
        </a>

        <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 12px 14px; font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 16px;">
          💡 <strong>Mẹo:</strong> Tiền thường về tài khoản ngân hàng của bạn chỉ sau vài giây (Napas247 24/7). Bạn vui lòng kiểm tra thông báo biến động số dư trên App ngân hàng nhé!
        </div>
      </div>

      <div class="footer">
        Cảm ơn bạn đã luôn tin tưởng và mua sắm hoàn tiền cùng DealHoàn.<br>
        Mọi thắc mắc cần hỗ trợ, vui lòng liên hệ: <a href="mailto:dealhoan@gmail.com" style="color: #ee4c23;">dealhoan@gmail.com</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildUserSuccessText(data: UserWithdrawalSuccessAlertData, siteUrl: string): string {
  const formattedAmount = formatVnd(data.amount);
  const timeStr = formatVietnamTime(data.completedAt);
  const displayName = data.userName || data.bankAccountName || "Bạn";

  return `[DEALHOÀN] THÔNG BÁO RÚT TIỀN THÀNH CÔNG

Xin chào ${displayName},

Yêu cầu rút tiền hoàn của bạn đã được Admin DealHoàn phê duyệt và chuyển khoản thành công qua hệ thống Napas247!

CHI TIẾT CHUYỂN KHOẢN:
- Số tiền: +${formattedAmount}
- Ngân hàng: ${data.bankName}
- Số tài khoản: ${data.bankAccountNo}
- Tên chủ tài khoản: ${data.bankAccountName}
- Thời gian: ${timeStr}
- Mã giao dịch: #${data.withdrawalId}

Vào ví DealHoàn kiểm tra:
${siteUrl}

Cảm ơn bạn đã đồng hành cùng DealHoàn!
Email hỗ trợ: dealhoan@gmail.com`;
}

/**
 * Gửi email thông báo cho người dùng khi Admin phê duyệt yêu cầu rút tiền thành công.
 * Hàm này an toàn (safe non-blocking) — không bao giờ ném ngoại lệ làm gián đoạn luồng xử lý của admin.
 */
export async function sendWithdrawalSuccessAlertToUser(
  data: UserWithdrawalSuccessAlertData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const settings = await getEmailSettings();

    if (!settings.enabled) {
      console.log("[User Email Notification] Bỏ qua gửi email: Tính năng thông báo đang tắt.");
      return { success: false, error: "Email notification is disabled" };
    }

    if (!settings.smtpPass) {
      console.warn("[User Email Notification] Thiếu SMTP_PASS để gửi email cho user.");
      return { success: false, error: "Missing SMTP password" };
    }

    if (!data.userEmail || !data.userEmail.includes("@")) {
      console.warn(`[User Email Notification] User không có email hợp lệ: ${data.userEmail}`);
      return { success: false, error: "Invalid user email" };
    }

    const transporter = createTransporter(settings);
    const siteUrl = getSiteUrl();
    const formattedAmount = formatVnd(data.amount);
    const subject = `[DealHoàn] 🎉 Yêu cầu rút tiền ${formattedAmount} của bạn đã thành công!`;

    const mailOptions = {
      from: `"${settings.senderName}" <${settings.senderEmail}>`,
      to: data.userEmail.trim(),
      subject,
      text: buildUserSuccessText(data, siteUrl),
      html: buildUserSuccessHtml(data, siteUrl),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `[User Email Notification] ✅ Đã gửi email thông báo rút tiền thành công tới user [${data.userEmail}] - MessageId: ${info.messageId}`
    );

    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[User Email Notification] ❌ Lỗi khi gửi email thông báo cho user:", errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Tự động tìm thông tin email người dùng và gửi email thông báo rút tiền thành công.
 * Non-blocking, chạy ngầm an toàn mà không làm chậm API phản hồi cho Admin.
 */
interface WithdrawalLookupQuery {
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null }>;
    };
  };
}

interface WithdrawalNotificationDbClient {
  from?: (table: string) => WithdrawalLookupQuery;
  auth?: {
    admin?: {
      getUserById: (uid: string) => Promise<{
        data?: {
          user?: {
            email?: string | null;
            user_metadata?: Record<string, unknown>;
          } | null;
        } | null;
      }>;
    };
  };
}

export async function notifyUserWithdrawalApproved(
  clientToUse: WithdrawalNotificationDbClient | null | undefined,
  withdrawalId: string,
  wrData?: {
    user_id?: string;
    amount?: number;
    bank_name?: string;
    bank_account_no?: string;
    bank_account_name?: string;
    note?: string | null;
  }
): Promise<void> {
  try {
    let wr: {
      user_id?: string;
      amount?: number;
      bank_name?: string;
      bank_account_no?: string;
      bank_account_name?: string;
      note?: string | null;
    } = wrData ? { ...wrData } : {};

    if (!wr.user_id || !wr.amount || !wr.bank_name || !wr.bank_account_no || !wr.bank_account_name) {
      if (clientToUse?.from) {
        const { data } = await clientToUse
          .from("withdrawal_requests")
          .select("*")
          .eq("id", withdrawalId)
          .maybeSingle();
        if (data) {
          wr = {
            ...data,
            ...(wr.user_id ? { user_id: wr.user_id } : {}),
            ...(wr.amount ? { amount: wr.amount } : {}),
            ...(wr.bank_name ? { bank_name: wr.bank_name } : {}),
            ...(wr.bank_account_no ? { bank_account_no: wr.bank_account_no } : {}),
            ...(wr.bank_account_name ? { bank_account_name: wr.bank_account_name } : {}),
            ...(wr.note !== undefined ? { note: wr.note } : {}),
          };
        }
      }
    }
    if (!wr || !wr.user_id) return;

    let userEmail = "";
    let userName = wr.bank_account_name || "";

    // 1. Lấy thông tin user từ auth.admin nếu có
    if (clientToUse?.auth?.admin) {
      try {
        const { data: userData } = await clientToUse.auth.admin.getUserById(String(wr.user_id));
        if (userData?.user?.email) {
          userEmail = userData.user.email;
          userName = String(
            userData.user.user_metadata?.full_name ||
            userData.user.user_metadata?.name ||
            userName ||
            userEmail.split("@")[0]
          );
        }
      } catch (err) {
        console.warn("auth.admin.getUserById error in notifyUserWithdrawalApproved:", err);
      }
    }

    // 2. Thử view admin_withdrawals_overview nếu chưa có email
    if (!userEmail && clientToUse?.from) {
      try {
        const { data: ovData } = await clientToUse
          .from("admin_withdrawals_overview")
          .select("user_email, user_name")
          .eq("id", withdrawalId)
          .maybeSingle();
        if (typeof ovData?.user_email === "string" && ovData.user_email) {
          userEmail = ovData.user_email;
          if (typeof ovData.user_name === "string" && ovData.user_name) {
            userName = ovData.user_name;
          }
        }
      } catch {}
    }

    // 3. Thử view admin_user_overview theo user_id nếu vẫn chưa có email
    if (!userEmail && clientToUse?.from) {
      try {
        const { data: userOvData } = await clientToUse
          .from("admin_user_overview")
          .select("email, full_name")
          .eq("user_id", String(wr.user_id))
          .maybeSingle();
        if (typeof userOvData?.email === "string" && userOvData.email) {
          userEmail = userOvData.email;
          if (typeof userOvData.full_name === "string" && userOvData.full_name) {
            userName = userOvData.full_name;
          }
        }
      } catch {}
    }

    if (userEmail && userEmail.includes("@")) {
      await sendWithdrawalSuccessAlertToUser({
        withdrawalId,
        userId: String(wr.user_id),
        userEmail,
        userName,
        amount: Number(wr.amount || 0),
        bankName: String(wr.bank_name || ""),
        bankAccountNo: String(wr.bank_account_no || ""),
        bankAccountName: String(wr.bank_account_name || ""),
        completedAt: new Date().toISOString(),
        note: wr.note || null,
      });
    } else {
      console.log(`[User Email Notification] Bỏ qua gửi email: Không tìm thấy email của user ${wr.user_id}`);
    }
  } catch (err) {
    console.warn("notifyUserWithdrawalApproved catch error:", err);
  }
}

function buildUserReceiptHtml(data: UserWithdrawalReceiptData, siteUrl: string): string {
  const formattedAmount = escapeHtml(formatVnd(data.amount));
  const timeStr = escapeHtml(formatVietnamTime(data.createdAt));
  const displayName = escapeHtml(data.userName || data.bankAccountName || "Bạn");
  const bankName = escapeHtml(data.bankName);
  const bankAccountNo = escapeHtml(data.bankAccountNo);
  const bankAccountName = escapeHtml(data.bankAccountName);
  const shortWithdrawalId = escapeHtml(data.withdrawalId.slice(0, 16));
  const safeSiteUrl = escapeHtml(siteUrl);

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tiếp Nhận Yêu Cầu Rút Tiền - DealHoàn</title>
  <style>
    body {
      margin: 0; padding: 0; background-color: #f4f6f8;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b; -webkit-font-smoothing: antialiased;
    }
    .wrapper { width: 100%; background-color: #f4f6f8; padding: 32px 16px; box-sizing: border-box; }
    .container {
      max-width: 580px; margin: 0 auto; background-color: #ffffff;
      border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #ee4c23 0%, #ff6b3d 100%);
      padding: 24px 28px; text-align: center; color: #ffffff;
    }
    .header-logo { font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px; }
    .header-sub { margin: 6px 0 0; font-size: 13px; opacity: 0.95; font-weight: 500; }
    .content { padding: 28px; }
    .badge-pending {
      display: inline-flex; align-items: center; gap: 6px;
      background-color: #fff7ed; border: 1px solid #fed7aa; color: #c2410c;
      font-size: 13px; font-weight: 700; padding: 6px 14px; border-radius: 9999px;
      margin-bottom: 20px;
    }
    .amount-box {
      background-color: #fffaf5; border: 1px solid #ffedd5; border-radius: 12px;
      padding: 20px; text-align: center; margin-bottom: 24px;
    }
    .amount-label { font-size: 12px; color: #c2410c; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px; }
    .amount-value { font-size: 34px; font-weight: 800; color: #ea580c; letter-spacing: -1px; margin: 0; }
    .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px; }
    .card-title { font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
    .account-no { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: #e2e8f0; padding: 3px 8px; border-radius: 6px; font-size: 14px; font-weight: 700; color: #0f172a; }
    .btn-action {
      display: block; width: 100%; box-sizing: border-box; background-color: #ee4c23;
      color: #ffffff !important; text-align: center; padding: 14px 20px; border-radius: 10px;
      text-decoration: none; font-size: 15px; font-weight: 700; margin: 24px 0 12px;
      box-shadow: 0 4px 12px rgba(238, 76, 35, 0.25);
    }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 28px; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <h1 class="header-logo">DealHoàn</h1>
        <p class="header-sub">Biên Nhận Yêu Cầu Rút Tiền</p>
      </div>

      <div class="content">
        <div style="text-align: center;">
          <div class="badge-pending">
            ⏳ Đã Tiếp Nhận Yêu Cầu Rút Tiền
          </div>
        </div>

        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
          Xin chào <strong>${displayName}</strong>,<br>
          DealHoàn đã tiếp nhận yêu cầu rút tiền của bạn. Lệnh rút đang được đối soát và sẽ giải ngân vào tài khoản của bạn trong <strong>24–48h làm việc</strong>.
        </p>

        <div class="amount-box">
          <div class="amount-label">Số Tiền Yêu Cầu Rút</div>
          <div class="amount-value">${formattedAmount}</div>
        </div>

        <div class="card">
          <div class="card-title">Tài Khoản Ngân Hàng Nhận Tiền</div>
          <table width="100%" cellpadding="6" cellspacing="0" style="font-size: 14px;">
            <tr>
              <td style="color: #64748b; font-weight: 500;">Ngân hàng thụ hưởng:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 700;">${bankName}</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Số tài khoản:</td>
              <td style="text-align: right;">
                <span class="account-no">${bankAccountNo}</span>
              </td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Tên chủ tài khoản:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 700; text-transform: uppercase;">
                ${bankAccountName}
              </td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Thời gian gửi yêu cầu:</td>
              <td style="text-align: right; color: #0f172a; font-weight: 600;">${timeStr}</td>
            </tr>
            <tr>
              <td style="color: #64748b; font-weight: 500;">Mã lệnh rút:</td>
              <td style="text-align: right; color: #64748b; font-size: 12px; font-family: monospace;">
                #${shortWithdrawalId}
              </td>
            </tr>
          </table>
        </div>

        <a href="${safeSiteUrl}" class="btn-action" target="_blank">
          👉 Mở Ví DealHoàn Theo Dõi Trạng Thái
        </a>

        <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 12px 14px; font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 16px;">
          💡 <strong>Thông báo tiếp theo:</strong> Ngay sau khi lệnh rút được Admin phê duyệt và tiền được chuyển khoản thành công qua hệ thống Napas247, hệ thống sẽ gửi thêm một email xác nhận đến bạn!
        </div>
      </div>

      <div class="footer">
        Cảm ơn bạn đã luôn tin tưởng và mua sắm hoàn tiền cùng DealHoàn.<br>
        Mọi thắc mắc cần hỗ trợ, vui lòng liên hệ: <a href="mailto:dealhoan@gmail.com" style="color: #ee4c23;">dealhoan@gmail.com</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildUserReceiptText(data: UserWithdrawalReceiptData, siteUrl: string): string {
  const formattedAmount = formatVnd(data.amount);
  const timeStr = formatVietnamTime(data.createdAt);
  const displayName = data.userName || data.bankAccountName || "Bạn";

  return `[DEALHOÀN] TIẾP NHẬN YÊU CẦU RÚT TIỀN

Xin chào ${displayName},

DealHoàn đã tiếp nhận yêu cầu rút tiền hoàn của bạn. Lệnh rút đang được đối soát và sẽ giải ngân vào tài khoản của bạn trong 24–48h làm việc.

CHI TIẾT LỆNH RÚT:
- Số tiền yêu cầu: ${formattedAmount}
- Ngân hàng thụ hưởng: ${data.bankName}
- Số tài khoản: ${data.bankAccountNo}
- Tên chủ tài khoản: ${data.bankAccountName}
- Thời gian gửi: ${timeStr}
- Mã lệnh: #${data.withdrawalId}

Theo dõi trạng thái tại ví DealHoàn:
${siteUrl}

Ngay khi lệnh được duyệt và chuyển tiền thành công, bạn sẽ nhận được email xác nhận.
Email hỗ trợ: dealhoan@gmail.com`;
}

/**
 * Gửi email biên nhận cho người dùng ngay khi họ gửi yêu cầu rút tiền thành công.
 * Non-blocking, an toàn — không bao giờ ném ngoại lệ làm gián đoạn API của user.
 */
export async function sendWithdrawalReceiptToUser(
  data: UserWithdrawalReceiptData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const settings = await getEmailSettings();

    if (!settings.enabled) {
      console.log("[User Receipt Email] Bỏ qua gửi email: Tính năng thông báo đang tắt.");
      return { success: false, error: "Email notification is disabled" };
    }

    if (!settings.smtpPass) {
      console.warn("[User Receipt Email] Thiếu SMTP_PASS để gửi email cho user.");
      return { success: false, error: "Missing SMTP password" };
    }

    if (!data.userEmail || !data.userEmail.includes("@")) {
      console.warn(`[User Receipt Email] User không có email hợp lệ: ${data.userEmail}`);
      return { success: false, error: "Invalid user email" };
    }

    const transporter = createTransporter(settings);
    const siteUrl = getSiteUrl();
    const formattedAmount = formatVnd(data.amount);
    const subject = `[DealHoàn] Tiếp nhận yêu cầu rút tiền: ${formattedAmount}`;

    const mailOptions = {
      from: `"${settings.senderName}" <${settings.senderEmail}>`,
      to: data.userEmail.trim(),
      subject,
      text: buildUserReceiptText(data, siteUrl),
      html: buildUserReceiptHtml(data, siteUrl),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `[User Receipt Email] ✅ Đã gửi email xác nhận nhận lệnh rút tiền tới [${data.userEmail}] - MessageId: ${info.messageId}`
    );

    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[User Receipt Email] ❌ Lỗi khi gửi email biên nhận cho user:", errorMsg);
    return { success: false, error: errorMsg };
  }
}
