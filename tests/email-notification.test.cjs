const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Email notification configuration and defaults", async () => {
  // Test file structure and modules
  const emailConfigPath = path.join(process.cwd(), "lib", "email", "email-config.ts");
  const notificationPath = path.join(process.cwd(), "lib", "email", "withdrawal-notification.ts");

  assert.equal(fs.existsSync(emailConfigPath), true, "email-config.ts must exist");
  assert.equal(fs.existsSync(notificationPath), true, "withdrawal-notification.ts must exist");

  const emailConfigContent = fs.readFileSync(emailConfigPath, "utf-8");
  assert.match(emailConfigContent, /dealhoan@gmail\.com/, "Must default sender to dealhoan@gmail.com");
  assert.match(emailConfigContent, /smtp\.gmail\.com/, "Must use Gmail SMTP host");
  assert.match(emailConfigContent, /maskEmailSettings/, "Must provide password masking");

  const notificationContent = fs.readFileSync(notificationPath, "utf-8");
  assert.match(notificationContent, /sendWithdrawalAlertToAdmins/, "Must provide sendWithdrawalAlertToAdmins");
  assert.match(notificationContent, /testEmailConnection/, "Must provide testEmailConnection");
  assert.match(notificationContent, /Yêu Cầu Rút Tiền Mới Cần Duyệt|Thông Báo Rút Tiền/i, "Must have HTML email template");
});

test("Wallet withdrawal route triggers email alert non-blocking", async () => {
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
});

test("Admin settings route supports email settings and test endpoint", async () => {
  const settingsRoutePath = path.join(process.cwd(), "app", "api", "admin", "settings", "route.ts");
  const testRoutePath = path.join(process.cwd(), "app", "api", "admin", "settings", "email", "test", "route.ts");

  assert.equal(fs.existsSync(testRoutePath), true, "Test email endpoint must exist");

  const settingsContent = fs.readFileSync(settingsRoutePath, "utf-8");
  assert.match(settingsContent, /emailSettings/, "Admin settings must expose emailSettings");
  assert.match(settingsContent, /updateEmailSettings/, "Admin settings must support updating email settings");
});

test("Admin approval triggers user withdrawal success notification email non-blocking", async () => {
  const adminWithdrawalsPath = path.join(process.cwd(), "app", "api", "admin", "withdrawals", "route.ts");
  const userWithdrawalsPath = path.join(process.cwd(), "app", "api", "admin", "users", "[id]", "withdrawals", "route.ts");
  const notificationPath = path.join(process.cwd(), "lib", "email", "withdrawal-notification.ts");

  const notificationContent = fs.readFileSync(notificationPath, "utf-8");
  assert.match(
    notificationContent,
    /sendWithdrawalSuccessAlertToUser/,
    "withdrawal-notification.ts must export sendWithdrawalSuccessAlertToUser"
  );
  assert.match(
    notificationContent,
    /notifyUserWithdrawalApproved/,
    "withdrawal-notification.ts must export notifyUserWithdrawalApproved"
  );
  assert.match(
    notificationContent,
    /Rút Tiền Thành Công|Yêu cầu rút tiền .* của bạn đã thành công/,
    "Email template must have success message for users"
  );

  const adminContent = fs.readFileSync(adminWithdrawalsPath, "utf-8");
  assert.match(
    adminContent,
    /notifyUserWithdrawalApproved\(clientToUse,\s*withdrawalId/,
    "Global admin approval route must call notifyUserWithdrawalApproved"
  );

  const userContent = fs.readFileSync(userWithdrawalsPath, "utf-8");
  assert.match(
    userContent,
    /notifyUserWithdrawalApproved\(clientToUse,\s*withdrawalId/,
    "User-specific admin approval route must call notifyUserWithdrawalApproved"
  );
});

