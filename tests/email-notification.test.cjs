const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const loadTs = require("./helpers/load-ts.cjs");

test("Email notification defaults are enabled for all admins without UI config", async () => {
  const emailConfigPath = path.join(process.cwd(), "lib", "email", "email-config.ts");
  const notificationPath = path.join(process.cwd(), "lib", "email", "withdrawal-notification.ts");

  assert.equal(fs.existsSync(emailConfigPath), true, "email-config.ts must exist");
  assert.equal(fs.existsSync(notificationPath), true, "withdrawal-notification.ts must exist");

  const prevPass = process.env.SMTP_PASS;
  const prevEnabled = process.env.EMAIL_NOTIFICATIONS_ENABLED;
  const prevAdmins = process.env.ADMIN_NOTIFICATION_EMAILS;

  try {
    process.env.SMTP_PASS = "abcd efgh ijkl mnop";
    delete process.env.EMAIL_NOTIFICATIONS_ENABLED;
    delete process.env.ADMIN_NOTIFICATION_EMAILS;

    const load = loadTs({
      "@supabase/supabase-js": { createClient: () => ({}) },
    });
    const { getEmailSettings } = load("lib/email/email-config.ts");
    const settings = await getEmailSettings();

    assert.equal(settings.enabled, true, "Email notifications must be enabled by default");
    assert.equal(settings.senderEmail, "dealhoan@gmail.com");
    assert.equal(settings.smtpHost, "smtp.gmail.com");
    assert.equal(settings.smtpPort, 465);
    assert.equal(settings.smtpPass, "abcdefghijklmnop", "Must strip spaces from Gmail app password");
    assert.ok(
      settings.adminEmails.includes("quangvh.technical@gmail.com"),
      "Must include quangvh.technical@gmail.com in default admin recipients"
    );
    assert.ok(
      settings.adminEmails.includes("trungquan2000bg@gmail.com"),
      "Must include trungquan2000bg@gmail.com in default admin recipients"
    );
  } finally {
    if (prevPass === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = prevPass;
    if (prevEnabled === undefined) delete process.env.EMAIL_NOTIFICATIONS_ENABLED;
    else process.env.EMAIL_NOTIFICATIONS_ENABLED = prevEnabled;
    if (prevAdmins === undefined) delete process.env.ADMIN_NOTIFICATION_EMAILS;
    else process.env.ADMIN_NOTIFICATION_EMAILS = prevAdmins;
  }
});

test("Admin email configuration panel and endpoints are removed", async () => {
  const adminClientPath = path.join(process.cwd(), "app", "admin", "admin-users-client.tsx");
  const settingsRoutePath = path.join(process.cwd(), "app", "api", "admin", "settings", "route.ts");
  const testRoutePath = path.join(
    process.cwd(),
    "app",
    "api",
    "admin",
    "settings",
    "email",
    "test",
    "route.ts"
  );

  assert.equal(fs.existsSync(testRoutePath), false, "Test email endpoint must be removed");

  const adminClientContent = fs.readFileSync(adminClientPath, "utf-8");
  assert.doesNotMatch(
    adminClientContent,
    /Thông Báo Rút Tiền Qua Email|Gửi email thử nghiệm|Lưu cấu hình Email|emailSettings/,
    "Admin settings UI must not render email configuration section"
  );

  const settingsContent = fs.readFileSync(settingsRoutePath, "utf-8");
  assert.doesNotMatch(
    settingsContent,
    /emailSettings|updateEmailSettings|maskEmailSettings/,
    "Admin settings API must not expose or mutate email settings"
  );
});

test("sendWithdrawalAlertToAdmins sends email to all admins by default", async () => {
  const sentMails = [];
  const prevPass = process.env.SMTP_PASS;
  const prevEnabled = process.env.EMAIL_NOTIFICATIONS_ENABLED;

  try {
    process.env.SMTP_PASS = "testpass12345678";
    delete process.env.EMAIL_NOTIFICATIONS_ENABLED;

    const load = loadTs({
      "@supabase/supabase-js": { createClient: () => ({}) },
      nodemailer: {
        createTransport: () => ({
          sendMail: async (options) => {
            sentMails.push(options);
            return { messageId: "msg-admin-1" };
          },
        }),
      },
    });

    const { sendWithdrawalAlertToAdmins } = load("lib/email/withdrawal-notification.ts");
    const result = await sendWithdrawalAlertToAdmins({
      withdrawalId: "w-test-1234567890",
      userId: "user-12345678",
      userEmail: "buyer@example.com",
      userName: "Nguyen <Test> A",
      amount: 150000,
      bankName: "MB Bank",
      bankAccountNo: "0123456789",
      bankAccountName: "NGUYEN TEST A",
      createdAt: "2026-11-20T07:00:00.000Z",
    });

    assert.equal(result.success, true);
    assert.equal(sentMails.length, 1);
    assert.match(sentMails[0].to, /quangvh\.technical@gmail\.com/);
    assert.match(sentMails[0].to, /trungquan2000bg@gmail\.com/);
    assert.match(sentMails[0].html, /Nguyen &lt;Test&gt; A/, "Must escape HTML in user display name");
  } finally {
    if (prevPass === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = prevPass;
    if (prevEnabled === undefined) delete process.env.EMAIL_NOTIFICATIONS_ENABLED;
    else process.env.EMAIL_NOTIFICATIONS_ENABLED = prevEnabled;
  }
});

test("notifyUserWithdrawalApproved resolves user email and sends approval email", async () => {
  const sentMails = [];
  const prevPass = process.env.SMTP_PASS;
  const prevEnabled = process.env.EMAIL_NOTIFICATIONS_ENABLED;

  try {
    process.env.SMTP_PASS = "testpass12345678";
    delete process.env.EMAIL_NOTIFICATIONS_ENABLED;

    const load = loadTs({
      "@supabase/supabase-js": { createClient: () => ({}) },
      nodemailer: {
        createTransport: () => ({
          sendMail: async (options) => {
            sentMails.push(options);
            return { messageId: "msg-user-1" };
          },
        }),
      },
    });

    const { notifyUserWithdrawalApproved } = load("lib/email/withdrawal-notification.ts");

    const mockSupabase = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === "withdrawal_requests") {
                return {
                  data: {
                    id: "w-approve-1",
                    user_id: "uid-999",
                    amount: 200000,
                    bank_name: "Vietcombank",
                    bank_account_no: "0011223344",
                    bank_account_name: "TRAN VAN B",
                  },
                };
              }
              return { data: null };
            },
          }),
        }),
      }),
      auth: {
        admin: {
          getUserById: async (uid) => ({
            data: {
              user: {
                id: uid,
                email: "tranvanb@gmail.com",
                user_metadata: { full_name: "Trần Văn B" },
              },
            },
          }),
        },
      },
    };

    await notifyUserWithdrawalApproved(mockSupabase, "w-approve-1", { note: "" });

    assert.equal(sentMails.length, 1);
    assert.equal(sentMails[0].to, "tranvanb@gmail.com");
    assert.match(sentMails[0].subject, /thành công/i);
    assert.match(sentMails[0].html, /Vietcombank/);
    assert.match(sentMails[0].html, /0011223344/);
  } finally {
    if (prevPass === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = prevPass;
    if (prevEnabled === undefined) delete process.env.EMAIL_NOTIFICATIONS_ENABLED;
    else process.env.EMAIL_NOTIFICATIONS_ENABLED = prevEnabled;
  }
});

test("Wallet withdrawal route triggers admin alert and user receipt non-blocking with after()", async () => {
  const routePath = path.join(process.cwd(), "app", "api", "wallet", "withdraw", "route.ts");
  const routeContent = fs.readFileSync(routePath, "utf-8");

  assert.match(
    routeContent,
    /sendWithdrawalAlertToAdmins/,
    "Withdrawal route must call sendWithdrawalAlertToAdmins"
  );
  assert.match(
    routeContent,
    /sendWithdrawalAlertToAdmins\(.+?\)\.catch/s,
    "Withdrawal route must call sendWithdrawalAlertToAdmins with non-blocking .catch"
  );
  assert.match(
    routeContent,
    /sendWithdrawalReceiptToUser/,
    "Withdrawal route must trigger sendWithdrawalReceiptToUser"
  );
  assert.match(
    routeContent,
    /after\(/,
    "Withdrawal route must use Next.js after() to keep serverless function alive on Vercel"
  );
});

test("Admin approval routes trigger user withdrawal success notification non-blocking with after()", async () => {
  const adminWithdrawalsPath = path.join(process.cwd(), "app", "api", "admin", "withdrawals", "route.ts");
  const userWithdrawalsPath = path.join(
    process.cwd(),
    "app",
    "api",
    "admin",
    "users",
    "[id]",
    "withdrawals",
    "route.ts"
  );

  const adminContent = fs.readFileSync(adminWithdrawalsPath, "utf-8");
  assert.match(
    adminContent,
    /notifyUserWithdrawalApproved\(clientToUse,\s*withdrawalId/,
    "Global admin approval route must call notifyUserWithdrawalApproved"
  );
  assert.match(
    adminContent,
    /after\(/,
    "Global admin approval route must use Next.js after()"
  );

  const userContent = fs.readFileSync(userWithdrawalsPath, "utf-8");
  assert.match(
    userContent,
    /notifyUserWithdrawalApproved\(clientToUse,\s*withdrawalId/,
    "User-specific admin approval route must call notifyUserWithdrawalApproved"
  );
  assert.match(
    userContent,
    /after\(/,
    "User-specific admin approval route must use Next.js after()"
  );
});
