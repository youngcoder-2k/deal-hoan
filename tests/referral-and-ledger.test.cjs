const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const loadTs = require("./helpers/load-ts.cjs");

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER_E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const USER_F = "ffffffff-ffff-4fff-8fff-ffffffffffff";

async function setupPgDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_app_meta_data jsonb default '{}'::jsonb,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz default now(),
      last_sign_in_at timestamptz
    );
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    insert into auth.users(id, email) values
      ('${USER_A}', 'user.a@gmail.com'),
      ('${USER_B}', 'user.b@gmail.com'),
      ('${USER_C}', 'user.c@gmail.com'),
      ('${USER_D}', 'user.d@gmail.com'),
      ('${USER_E}', 'user.e@gmail.com'),
      ('${USER_F}', 'user.f@gmail.com');
  `);

  // Chạy chuỗi schema thực tế giống Supabase
  const walletSql = fs.readFileSync("supabase/schema-wallet.sql", "utf8");
  const recordingSql = fs.readFileSync("supabase/schema-cashback-recording.sql", "utf8");
  const patchesSql = fs.readFileSync("supabase/schema-security-patches.sql", "utf8");
  const referralLedgerSql = fs.readFileSync("supabase/schema-referral-ledger.sql", "utf8");

  await db.exec(walletSql);
  await db.exec(recordingSql);
  await db.exec(patchesSql);
  await db.exec(referralLedgerSql);
  // Chạy lặp lại schema-referral-ledger.sql để chắc chắn idempotent 100%
  await db.exec(referralLedgerSql);

  return db;
}

async function getWallet(db, uid) {
  const r = await db.query(
    "select balance::int, pending_balance::int, locked_balance::int, total_withdrawn::int from public.user_wallets where user_id = $1",
    [uid]
  );
  return r.rows[0] || { balance: 0, pending_balance: 0, locked_balance: 0, total_withdrawn: 0 };
}

async function assertFullReconciliation(db) {
  const r = await db.query(`
    select user_id, diff_balance::int, diff_pending::int, diff_locked::int, diff_withdrawn::int
    from public.wallet_ledger_reconciliation
    where diff_balance <> 0 or diff_pending <> 0 or diff_locked <> 0 or diff_withdrawn <> 0
  `);
  assert.deepEqual(r.rows, [], `Sổ cái bị lệch so với user_wallets: ${JSON.stringify(r.rows)}`);
}

test("Anti-fraud pure helpers: Gmail normalization, hashing, IP extraction, and sanitization", () => {
  const af = loadTs()("lib/referral/anti-fraud.ts");

  assert.equal(af.normalizeEmailForFraudCheck("Nguyen.Van.A+promo@gmail.com"), "nguyenvana@gmail.com");
  assert.equal(af.normalizeEmailForFraudCheck("nguyenvana@googlemail.com"), "nguyenvana@gmail.com");
  assert.equal(af.normalizeEmailForFraudCheck("user.name+1@yahoo.com"), "user.name@yahoo.com");

  const h1 = af.hashSignal("1.2.3.4", "ip");
  const h2 = af.hashSignal("1.2.3.4", "ip");
  const h3 = af.hashSignal("1.2.3.4", "fp");
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.equal(h1.length, 64);

  const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
  assert.equal(af.extractClientIp(headers), "203.0.113.5");
  assert.equal(af.sanitizeDeviceId("dev_abcdef123456"), "dev_abcdef123456");
  assert.equal(af.sanitizeDeviceId("bad id!!"), "");
  assert.equal(af.sanitizeFingerprintHash("0123456789abcdef0123456789abcdef"), "0123456789abcdef0123456789abcdef");
  assert.equal(af.sanitizeFingerprintHash("not-hex"), "");
});

test("CSV Formula Injection protection: neutralizes spreadsheet formulas while preserving numbers", () => {
  const { escapeCsvCell, sanitizeCsvString } = loadTs()("lib/referral/csv.ts");

  assert.equal(sanitizeCsvString("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
  assert.equal(sanitizeCsvString("+1+1"), "'+1+1");
  assert.equal(sanitizeCsvString("-2+3"), "'-2+3");
  assert.equal(sanitizeCsvString("@SUM(A1:A2)"), "'@SUM(A1:A2)");
  assert.equal(sanitizeCsvString("  =HYPERLINK(\"http://evil\")"), "'  =HYPERLINK(\"http://evil\")");
  assert.equal(sanitizeCsvString("\t=1+1"), "'\t=1+1");
  assert.equal(sanitizeCsvString("\r+1+1"), "'\r+1+1");
  assert.equal(sanitizeCsvString("Normal Note"), "Normal Note");

  assert.equal(escapeCsvCell(-10000), '"-10000"');
  assert.equal(escapeCsvCell(50000), '"50000"');
  assert.equal(escapeCsvCell('=1+1"quote'), '"\'=1+1""quote"');
  assert.equal(escapeCsvCell(null), '""');
});

test("PostgreSQL Referral + Immutable Ledger: full lock -> unlock (50k/50k with withdrawal), anti-fraud device/fp/IP/bank, expiry & 100% reconciliation", async () => {
  const db = await setupPgDb();
  try {
    // 1. Kiểm tra phân quyền nghiêm ngặt
    const perms = (
      await db.query(`
        select
          has_function_privilege('authenticated', 'public.register_user_referral(jsonb)', 'execute') as client_reg,
          has_function_privilege('authenticated', 'public.admin_decide_referral(uuid,text,text,text)', 'execute') as client_admin_dec,
          has_function_privilege('authenticated', 'public.admin_adjust_wallet(uuid,bigint,bigint,bigint,text,text)', 'execute') as client_admin_adj,
          has_table_privilege('authenticated', 'public.wallet_ledger', 'insert') as client_ledger_ins,
          has_table_privilege('authenticated', 'public.wallet_ledger', 'select') as client_ledger_sel,
          has_function_privilege('service_role', 'public.register_user_referral(jsonb)', 'execute') as svc_reg
      `)
    ).rows[0];
    assert.deepEqual(perms, {
      client_reg: false,
      client_admin_dec: false,
      client_admin_adj: false,
      client_ledger_ins: false,
      client_ledger_sel: true,
      svc_reg: true,
    });

    // Ghi nhận thiết bị của User A trước
    await db.query(
      `insert into public.user_device_signals(user_id, device_id, fingerprint_hash, ip_hash)
       values ($1, 'dev_user_a_phone', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'ip_hash_office_1')`,
      [USER_A]
    );

    // 2. Đăng ký giới thiệu hợp lệ A -> B (khác thiết bị, khác fingerprint, khác IP)
    const regB = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_B,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "userb@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_user_b_phone",
          fingerprint_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          ip_hash: "ip_hash_home_b",
        }),
      ])
    ).rows[0].res;
    assert.equal(regB.success, true);
    assert.equal(regB.referral.status, "locked");
    assert.equal(regB.referral.fraud_status, "clean");

    // Ngay khi giới thiệu: cả A và B đều có +10k vào Đang khóa (locked_balance)
    assert.deepEqual(await getWallet(db, USER_A), {
      balance: 0,
      pending_balance: 0,
      locked_balance: 10000,
      total_withdrawn: 0,
    });
    assert.deepEqual(await getWallet(db, USER_B), {
      balance: 0,
      pending_balance: 0,
      locked_balance: 10000,
      total_withdrawn: 0,
    });

    // 3. Kiểm tra tính BẤT BIẾN của Sổ cái (không cho sửa / xóa)
    await assert.rejects(
      db.query("update public.wallet_ledger set delta_locked = 0"),
      /wallet_ledger_is_immutable/
    );
    await assert.rejects(
      db.query("delete from public.wallet_ledger"),
      /wallet_ledger_is_immutable/
    );

    // 4. B hoàn thành đơn được 50.000đ khả dụng -> nhưng A mới có 0đ => PHẢI GIỮ ĐANG KHÓA
    await db.query("select public.record_cashback_order($1::jsonb)", [
      JSON.stringify({
        user_id: USER_B,
        order_id: "ORD_B_1",
        platform: "Shopee",
        status: "pending",
        order_value: 500000,
        commission_amount: 65000,
        cashback_amount: 50000,
      }),
    ]);
    await db.query("select public.record_cashback_order($1::jsonb)", [
      JSON.stringify({
        user_id: USER_B,
        order_id: "ORD_B_1",
        platform: "Shopee",
        status: "completed",
        order_value: 500000,
        commission_amount: 65000,
        cashback_amount: 50000,
      }),
    ]);

    let refStatusB = (await db.query("select status from public.user_referrals where referee_id = $1", [USER_B])).rows[0].status;
    assert.equal(refStatusB, "locked", "A chưa đủ 50k nên thưởng vẫn phải đang khóa");

    // B rút bớt 30.000đ -> balance = 20k, total_withdrawn = 30k (tổng khả dụng + đã rút vẫn = 50k!)
    const wdRes = (
      await db.query("select public.create_withdrawal_request($1,$2,$3,$4,$5) as res", [
        USER_B,
        30000,
        "MB Bank",
        "1234567890",
        "NGUYEN VAN B",
      ])
    ).rows[0].res;
    assert.equal(wdRes.success, true);
    await db.query("select public.process_withdrawal_decision($1, 'completed', 'CK thanh cong')", [
      wdRes.request.id,
    ]);

    // 5. A hoàn thành đơn 50.000đ -> Cả A (>=50k) và B (20k khả dụng + 30k đã rút = 50k) đều đạt => TỰ ĐỘNG MỞ KHÓA!
    await db.query("select public.record_cashback_order($1::jsonb)", [
      JSON.stringify({
        user_id: USER_A,
        order_id: "ORD_A_1",
        platform: "Shopee",
        status: "completed",
        order_value: 500000,
        commission_amount: 65000,
        cashback_amount: 50000,
      }),
    ]);

    refStatusB = (await db.query("select status from public.user_referrals where referee_id = $1", [USER_B])).rows[0].status;
    assert.equal(refStatusB, "unlocked", "Cả A và B đạt >= 50k phải tự động mở khóa");

    assert.deepEqual(await getWallet(db, USER_A), {
      balance: 60000, // 50k đơn hàng + 10k thưởng mở khóa
      pending_balance: 0,
      locked_balance: 0,
      total_withdrawn: 0,
    });
    assert.deepEqual(await getWallet(db, USER_B), {
      balance: 30000, // 20k còn lại sau rút + 10k thưởng mở khóa
      pending_balance: 0,
      locked_balance: 0,
      total_withdrawn: 30000,
    });

    // 6. Chống gian lận LỚP 1: Chặn cứng trùng Device ID & Browser Fingerprint & Email chuẩn hóa & Tự mời
    const selfRef = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({ referrer_id: USER_A, referee_id: USER_A, ref_code: "u_aaaaaaaa" }),
      ])
    ).rows[0].res;
    assert.equal(selfRef.success, false);
    assert.equal(selfRef.code, "self_referral_not_allowed");

    const sameDevice = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_C,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "userc@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_user_a_phone", // Trùng Device ID của A!
          fingerprint_hash: "cccccccccccccccccccccccccccccccc",
          ip_hash: "ip_hash_c",
        }),
      ])
    ).rows[0].res;
    assert.equal(sameDevice.success, false);
    assert.equal(sameDevice.code, "same_device_detected");

    const sameFp = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_C,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "userc@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_incognito_new", // Xóa cookie / ẩn danh nhưng vẫn trùng Browser Fingerprint của A!
          fingerprint_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          ip_hash: "ip_hash_c",
        }),
      ])
    ).rows[0].res;
    assert.equal(sameFp.success, false);
    assert.equal(sameFp.code, "same_device_fingerprint_detected");

    const repeatRefereeDevice = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_C,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "userc@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_user_b_phone", // Máy đã từng làm B ăn thưởng rồi!
          fingerprint_hash: "cccccccccccccccccccccccccccccccc",
          ip_hash: "ip_hash_c",
        }),
      ])
    ).rows[0].res;
    assert.equal(repeatRefereeDevice.success, false);
    assert.equal(repeatRefereeDevice.code, "device_already_claimed_referral");

    const dupEmail = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_C,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "userb@gmail.com", // Trùng email chuẩn hóa của B
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_user_c_clean",
          fingerprint_hash: "cccccccccccccccccccccccccccccccc",
          ip_hash: "ip_hash_c",
        }),
      ])
    ).rows[0].res;
    assert.equal(dupEmail.success, false);
    assert.equal(dupEmail.code, "duplicate_email_already_claimed");

    // 7. Chống gian lận LỚP 2: Trùng IP trong 24h (khác thiết bị) -> gắn cờ flagged -> khi đạt 50k chuyển review_pending để Admin duyệt
    const regD = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_D,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "userd@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_user_d_phone",
          fingerprint_hash: "dddddddddddddddddddddddddddddddd",
          ip_hash: "ip_hash_office_1", // Trùng IP với A trong 24h!
        }),
      ])
    ).rows[0].res;
    assert.equal(regD.success, true);
    assert.equal(regD.referral.fraud_status, "flagged");
    assert.ok(regD.referral.fraud_reasons.includes("same_ip_within_24h"));

    // D đạt 50k (A đã đạt 50k sẵn) -> vì bị flagged IP nên KHÔNG tự mở khóa, chuyển review_pending
    await db.query("select public.record_cashback_order($1::jsonb)", [
      JSON.stringify({
        user_id: USER_D,
        order_id: "ORD_D_1",
        platform: "Shopee",
        status: "completed",
        order_value: 500000,
        commission_amount: 65000,
        cashback_amount: 50000,
      }),
    ]);
    const statusD = (await db.query("select status from public.user_referrals where id = $1", [regD.referral.id])).rows[0].status;
    assert.equal(statusD, "review_pending");

    // Admin duyệt tay -> mở khóa +10k cho A và D
    const approveD = (
      await db.query("select public.admin_decide_referral($1, 'approve', 'admin@dealhoan.vn', 'Ban chung Wi-Fi hop le') as res", [
        regD.referral.id,
      ])
    ).rows[0].res;
    assert.equal(approveD.success, true);
    assert.equal((await getWallet(db, USER_D)).balance, 60000);
    assert.equal((await getWallet(db, USER_A)).balance, 70000);

    // 8. Chống trùng STK ngân hàng (A & E cùng STK) -> bị flagged review_pending -> Admin thu hồi (revoke)
    await db.query("update public.user_wallets set bank_account_no = '9999888877' where user_id = $1", [USER_A]);
    const regE = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_E,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "usere@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_user_e_phone",
          fingerprint_hash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          ip_hash: "ip_hash_e",
        }),
      ])
    ).rows[0].res;
    assert.equal(regE.success, true);
    await db.query("update public.user_wallets set bank_account_no = '9999-8888-77' where user_id = $1", [USER_E]);
    await db.query("select public.record_cashback_order($1::jsonb)", [
      JSON.stringify({
        user_id: USER_E,
        order_id: "ORD_E_1",
        platform: "Shopee",
        status: "completed",
        order_value: 500000,
        commission_amount: 65000,
        cashback_amount: 50000,
      }),
    ]);
    const rowE = (await db.query("select status, fraud_reasons from public.user_referrals where id = $1", [regE.referral.id])).rows[0];
    assert.equal(rowE.status, "review_pending");
    assert.ok(rowE.fraud_reasons.includes("same_bank_account"));

    // Admin thu hồi thưởng của cặp A-E
    await db.query("select public.admin_decide_referral($1, 'revoke', 'admin@dealhoan.vn', 'Trung STK ngan hang')", [
      regE.referral.id,
    ]);
    assert.equal((await getWallet(db, USER_E)).locked_balance, 0);
    assert.equal((await getWallet(db, USER_A)).locked_balance, 0);

    // 9. Kiểm tra hết hạn 90 ngày + Admin chỉnh ví + Từ chối lệnh rút (hoàn tiền) -> đều vào Sổ cái
    const regF = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_F,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "userf@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_user_f_phone",
          fingerprint_hash: "ffffffffffffffffffffffffffffffff",
          ip_hash: "ip_hash_f",
        }),
      ])
    ).rows[0].res;
    assert.equal(regF.success, true);
    await db.query("update public.user_referrals set expires_at = now() - interval '1 day' where id = $1", [
      regF.referral.id,
    ]);
    const expRes = (await db.query("select public.expire_overdue_referrals() as res")).rows[0].res;
    assert.equal(expRes.expired_count, 1);
    assert.equal((await getWallet(db, USER_F)).locked_balance, 0);
    assert.equal((await getWallet(db, USER_A)).locked_balance, 0);

    // Admin chỉnh số dư thủ công + User E rút tiền bị Admin từ chối hoàn về ví
    await db.query("select public.admin_adjust_wallet($1, 55000, null, null, 'admin@dealhoan.vn', 'Thuong su kien')", [
      USER_E,
    ]);
    const wdE = (
      await db.query("select public.create_withdrawal_request($1,$2,$3,$4,$5) as res", [
        USER_E,
        20000,
        "Vietcombank",
        "7777666655",
        "NGUYEN VAN E",
      ])
    ).rows[0].res;
    await db.query("select public.process_withdrawal_decision($1, 'rejected', 'Sai ten chu TK')", [
      wdE.request.id,
    ]);
    assert.equal((await getWallet(db, USER_E)).balance, 55000);
    assert.equal((await getWallet(db, USER_E)).total_withdrawn, 0);

    // 10. ĐỐI SOÁT SỔ CÁI TOÀN HỆ THỐNG: Tổng biến động Sổ cái PHẢI KHỚP 100% (lệch = 0đ) trên mọi user & mọi loại số dư!
    await assertFullReconciliation(db);

    const ledgerCount = (await db.query("select count(*)::int as c from public.wallet_ledger")).rows[0].c;
    assert.ok(ledgerCount >= 18, `Sổ cái phải ghi nhận đầy đủ tất cả bút toán (thực tế: ${ledgerCount})`);
  } finally {
    await db.close();
  }
});

test("Dynamic Admin cashback percentage: changing userCashbackPercent from 88% to 80% propagates to both recordCashbackOrder and autoSettleHoldPeriodOrders", async () => {
  let activeSettings = { userCashbackPercent: 80, safetyMarginPercent: 20 };
  const recorded = [];
  const mockDb = {
    from: () => ({
      select: () => ({
        eq: (col1, val1) => ({
          limit: async () =>
            val1 === "pending"
              ? {
                  data: [
                    {
                      order_id: "ORD_DYN_80",
                      sub_id: `u_${USER_A}`,
                      user_id: USER_A,
                      platform: "Shopee",
                      order_value: 100000,
                      commission_amount: 10000,
                      cashback_amount: 7832, // Mức cũ 88%, cần hạ về 80% = 7120đ
                      status: "pending",
                      ordered_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
                    },
                  ],
                }
              : { data: [] },
          eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }),
        }),
      }),
    }),
    rpc: async (_fn, { p_order }) => {
      recorded.push(p_order);
      return { data: { id: "uuid", ...p_order }, error: null };
    },
  };

  const { recordCashbackOrder, autoSettleHoldPeriodOrders } = loadTs({
    "@/lib/supabase/service": { getSupabaseServiceClient: () => mockDb },
    "@/lib/deals/cashback-booster": {
      getBoosterSettings: async () => activeSettings,
      getBoosterSettingsSync: () => activeSettings,
    },
  })("lib/deals/cashback.ts");

  // Ở mức Admin đặt 80%: 10.000 * 0.89 * 0.80 = 7.120đ
  const r1 = await recordCashbackOrder({
    orderId: "ORD_TEST_80",
    userId: USER_A,
    commissionAmount: 10000,
    status: "pending",
  });
  assert.equal(r1.success, true);
  assert.equal(recorded[0].cashback_amount, 7120);

  // autoSettleHoldPeriodOrders cũng chuẩn hóa theo 80% (7.120đ), không cứng 88% (7.832đ)
  const settleRes = await autoSettleHoldPeriodOrders({ db: mockDb });
  assert.equal(settleRes.reconciledCount, 1);
  assert.equal(recorded[1].cashback_amount, 7120);

  // Admin đổi nóng sang 75% (margin 25%): 10.000 * 0.89 * 0.75 = 6.675đ
  activeSettings = { userCashbackPercent: 75, safetyMarginPercent: 25 };
  const r2 = await recordCashbackOrder({
    orderId: "ORD_TEST_75",
    userId: USER_A,
    commissionAmount: 10000,
    status: "pending",
  });
  assert.equal(r2.success, true);
  assert.equal(recorded[2].cashback_amount, 6675);

  // Hoạt động đúng kể cả khi cấu hình chỉ cung cấp userCashbackPercent (không kèm safetyMarginPercent)
  activeSettings = { userCashbackPercent: 82 };
  const r3 = await recordCashbackOrder({
    orderId: "ORD_TEST_82",
    userId: USER_A,
    commissionAmount: 10000,
    status: "pending",
  });
  assert.equal(r3.success, true);
  assert.equal(recorded[3].cashback_amount, 7298); // 10000 * 0.89 * 0.82 = 7298
});

test("Security & Ledger Hardening: missing device bypass, spoofed device history, cycles, account age, bank-swap history, overdue review_pending, actor_id & reconcile_wallet_pending_balance", async () => {
  const db = await setupPgDb();
  const USER_G = "11111111-1111-4111-8111-111111111117";
  const USER_H = "11111111-1111-4111-8111-111111111118";
  const USER_I = "11111111-1111-4111-8111-111111111119";
  try {
    await db.query(
      `insert into auth.users(id, email, created_at) values
        ($1, 'old.user@gmail.com', now() - interval '60 days'),
        ($2, 'user.h@gmail.com', now()),
        ($3, 'user.i@gmail.com', now())`,
      [USER_G, USER_H, USER_I]
    );

    // 1. Chặn bypass gọi API trống cả device_id lẫn fingerprint_hash
    const emptySig = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_B,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "userb@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "",
          fingerprint_hash: "",
          ip_hash: "ip_clean_1",
        }),
      ])
    ).rows[0].res;
    assert.equal(emptySig.success, false);
    assert.equal(emptySig.code, "missing_device_signal");

    // 2. Chặn tài khoản cũ quá hạn maxAccountAgeDays (mặc định 1 ngày)
    // Kiểm chứng cả tài khoản tạo 2 ngày trước cũng bị chặn
    await db.query("update auth.users set created_at = now() - interval '2 days' where id = $1", [USER_G]);
    const oldAcc = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_G,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "olduser@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_old_user_g",
          fingerprint_hash: "11111111111111111111111111111117",
          ip_hash: "ip_old_g",
        }),
      ])
    ).rows[0].res;
    assert.equal(oldAcc.success, false);
    assert.equal(oldAcc.code, "account_too_old_for_referral");

    // 3. Chặn đối chiếu lịch sử thiết bị: C từng đăng nhập trên máy A, sau đó gửi device_id giả
    await db.query(
      `insert into public.user_device_signals(user_id, device_id, fingerprint_hash, ip_hash) values
        ($1, 'dev_real_a_999', 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', 'ip_a_1'),
        ($2, 'dev_real_a_999', 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1', 'ip_a_1')`,
      [USER_A, USER_C]
    );
    const spoofedC = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_C,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "userc@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_fake_spoofed_123",
          fingerprint_hash: "c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1",
          ip_hash: "ip_c_spoof",
        }),
      ])
    ).rows[0].res;
    assert.equal(spoofedC.success, false);
    assert.equal(spoofedC.code, "same_device_detected");

    // 4. Chặn giới thiệu chéo / vòng tròn: A -> B hợp lệ, sau đó B -> A bị chặn cứng
    const regAB = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_B,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "userb@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_b_clean_001",
          fingerprint_hash: "b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1",
          ip_hash: "ip_b_1",
        }),
      ])
    ).rows[0].res;
    assert.equal(regAB.success, true);

    const reciprocalBA = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_B,
          referee_id: USER_A,
          ref_code: "u_bbbbbbbb",
          referee_email_normalized: "usera@gmail.com",
          referrer_email_normalized: "userb@gmail.com",
          device_id: "dev_a_other_002",
          fingerprint_hash: "a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2",
          ip_hash: "ip_a_2",
        }),
      ])
    ).rows[0].res;
    assert.equal(reciprocalBA.success, false);
    assert.equal(reciprocalBA.code, "reciprocal_referral_not_allowed");

    // 5. Thiếu fingerprint (chỉ có device_id) -> bị gắn cờ missing_fingerprint_signal để Admin duyệt tay
    const partialD = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_D,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "userd@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_d_only_id_01",
          fingerprint_hash: "",
          ip_hash: "ip_d_1",
        }),
      ])
    ).rows[0].res;
    assert.equal(partialD.success, true);
    assert.equal(partialD.referral.fraud_status, "flagged");
    assert.ok(partialD.referral.fraud_reasons.includes("missing_fingerprint_signal"));

    // Đưa D sang review_pending rồi cho quá hạn -> evaluate_referral_unlocks_for_user phải tự expire luôn review_pending!
    await db.query("update public.user_referrals set status = 'review_pending', expires_at = now() - interval '1 hour' where id = $1", [
      partialD.referral.id,
    ]);
    const evalExp = (await db.query("select public.evaluate_referral_unlocks_for_user($1) as res", [USER_D])).rows[0].res;
    assert.equal(evalExp.expired, 1);
    const dStatusAfter = (await db.query("select status from public.user_referrals where id = $1", [partialD.referral.id])).rows[0].status;
    assert.equal(dStatusAfter, "expired");

    // 6. Chống chiêu rút tiền về STK A rồi xóa/đổi STK trên ví B trước khi mở khóa
    const regAH = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_H,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "userh@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_h_clean_001",
          fingerprint_hash: "88888888888888888888888888888888",
          ip_hash: "ip_h_1",
        }),
      ])
    ).rows[0].res;
    assert.equal(regAH.success, true);

    await db.query("update public.user_wallets set bank_account_no = '5555444433' where user_id = $1", [USER_A]);
    // H nhận 50k đơn, rút 10k về STK của A rồi xóa trắng STK trên ví của H
    await db.query("select public.record_cashback_order($1::jsonb)", [
      JSON.stringify({
        user_id: USER_H,
        order_id: "ORD_H_1",
        platform: "Shopee",
        status: "completed",
        order_value: 500000,
        commission_amount: 65000,
        cashback_amount: 50000,
      }),
    ]);
    const wdH = (
      await db.query("select public.create_withdrawal_request($1,$2,$3,$4,$5) as res", [
        USER_H,
        10000,
        "MB Bank",
        "5555444433",
        "NGUYEN VAN A",
      ])
    ).rows[0].res;
    assert.equal(wdH.success, true);
    await db.query("update public.user_wallets set bank_account_no = '1111999900' where user_id = $1", [USER_H]);

    // 7. process_withdrawal_decision ghi đúng email Admin thật vào wallet_ledger.actor_id
    await db.query("select public.process_withdrawal_decision($1, 'completed', 'CK OK', 'quangvh.technical@gmail.com')", [
      wdH.request.id,
    ]);
    const wdActor = (
      await db.query(
        "select actor_id from public.wallet_ledger where entry_type = 'withdrawal_completed' and reference_id = $1",
        [wdH.request.id]
      )
    ).rows[0].actor_id;
    assert.equal(wdActor, "quangvh.technical@gmail.com");

    // 8. admin_adjust_wallet tăng số dư A lên 50k -> kích hoạt đánh giá referral (A->B tự mở khóa; A->H bị phát hiện trùng STK từ lịch sử rút -> review_pending!)
    // Và admin_adjust_wallet phải trả về số dư ví MỚI NHẤT sau khi đã mở khóa thưởng A->B (50k + 10k = 60k)
    await db.query("select public.record_cashback_order($1::jsonb)", [
      JSON.stringify({
        user_id: USER_B,
        order_id: "ORD_B_NEW",
        platform: "Shopee",
        status: "completed",
        order_value: 500000,
        commission_amount: 65000,
        cashback_amount: 50000,
      }),
    ]);
    const adjA = (
      await db.query("select public.admin_adjust_wallet($1, 50000, null, null, 'quangvh.technical@gmail.com', 'Bu don') as res", [
        USER_A,
      ])
    ).rows[0].res;
    assert.equal(adjA.success, true);
    assert.equal(Number(adjA.wallet.balance), 60000, "admin_adjust_wallet phải trả về số dư sau khi mở khóa thưởng A->B");

    const refAHStatus = (await db.query("select status, fraud_reasons from public.user_referrals where id = $1", [regAH.referral.id])).rows[0];
    assert.equal(refAHStatus.status, "review_pending", "H dù đổi STK trên ví vẫn phải bị phát hiện trùng STK A từ lịch sử withdrawal_requests");
    assert.ok(refAHStatus.fraud_reasons.includes("same_bank_account"));

    // 9. Kiểm tra reconcile_wallet_pending_balance ghi đủ Sổ cái khi pending_balance bị hụt so với đơn pending
    await db.query("select public.record_cashback_order($1::jsonb)", [
      JSON.stringify({
        user_id: USER_I,
        order_id: "ORD_I_PEND",
        platform: "Shopee",
        status: "pending",
        order_value: 100000,
        commission_amount: 10000,
        cashback_amount: 7832,
      }),
    ]);
    // Giả lập admin chỉnh pending xuống 0 rồi gọi reconcile_wallet_pending_balance
    await db.query("select public.admin_adjust_wallet($1, null, 0, null, 'admin@dealhoan.vn', 'Reset test')", [USER_I]);
    const syncI = (await db.query("select public.reconcile_wallet_pending_balance($1, 'wallet_api_sync') as res", [USER_I])).rows[0].res;
    assert.equal(syncI.synced, true);
    assert.equal(Number(syncI.pending_balance), 7832);
    assert.equal(Number(syncI.delta_pending), 7832);

    // 10. Kiểm tra tài khoản đã có hoạt động ví (balance > 0, không có đơn) không được nhận mã giới thiệu
    await db.query("select public.admin_adjust_wallet($1, 20000, null, null, 'admin@dealhoan.vn', 'Nap vi')", [USER_F]);
    const walletActF = (
      await db.query("select public.register_user_referral($1::jsonb) as res", [
        JSON.stringify({
          referrer_id: USER_A,
          referee_id: USER_F,
          ref_code: "u_aaaaaaaa",
          referee_email_normalized: "userf@gmail.com",
          referrer_email_normalized: "usera@gmail.com",
          device_id: "dev_f_clean_001",
          fingerprint_hash: "f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1",
          ip_hash: "ip_f_1",
        }),
      ])
    ).rows[0].res;
    assert.equal(walletActF.success, false);
    assert.equal(walletActF.code, "existing_wallet_activity_not_eligible");

    // 11. Kiểm tra an toàn clamping khi từ chối lệnh rút (legacy total_withdrawn < amount): Sổ cái vẫn khớp 0đ lệch!
    const wdF = (
      await db.query("select public.create_withdrawal_request($1,$2,$3,$4,$5) as res", [
        USER_F,
        15000,
        "Vietcombank",
        "8888777766",
        "NGUYEN VAN F",
      ])
    ).rows[0].res;
    assert.equal(wdF.success, true);
    // Mô phỏng trường hợp legacy: tạo 1 lệnh rút thứ 2 hoặc giảm total_withdrawn nhỏ hơn amount trong khi giữ đồng bộ sổ cái
    // Gọi reject trực tiếp với admin email thật và xác minh actor_id + reconciliation
    await db.query("select public.process_withdrawal_decision($1, 'rejected', 'Sai STK', 'trungquan2000bg@gmail.com')", [
      wdF.request.id,
    ]);
    const rejActor = (
      await db.query(
        "select actor_id, delta_balance::int, delta_withdrawn::int from public.wallet_ledger where entry_type = 'withdrawal_rejected' and reference_id = $1",
        [wdF.request.id]
      )
    ).rows[0];
    assert.equal(rejActor.actor_id, "trungquan2000bg@gmail.com");
    assert.equal(rejActor.delta_balance, 15000);
    assert.equal(rejActor.delta_withdrawn, -15000);

    // 11B. Trường hợp biên legacy: total_withdrawn nhỏ hơn v_req.amount -> trừ đúng số thực có để Sổ cái không lệch
    const wdF2 = (
      await db.query("select public.create_withdrawal_request($1,$2,$3,$4,$5) as res", [
        USER_F,
        15000,
        "Vietcombank",
        "8888777766",
        "NGUYEN VAN F",
      ])
    ).rows[0].res;
    await db.query("update public.user_wallets set total_withdrawn = 5000 where user_id = $1", [USER_F]);
    await db.query(
      "select public.append_wallet_ledger($1, 'reconciliation_sync', 0, 0, 0, -10000, 'test', 'clamp', null, 'system', 'test', 'legacy sync', '{}'::jsonb)",
      [USER_F]
    );
    await db.query("select public.process_withdrawal_decision($1, 'rejected', 'Clamp test', 'admin@dealhoan.vn')", [
      wdF2.request.id,
    ]);
    const clampedEntry = (
      await db.query(
        "select delta_balance::int, delta_withdrawn::int from public.wallet_ledger where entry_type = 'withdrawal_rejected' and reference_id = $1",
        [wdF2.request.id]
      )
    ).rows[0];
    assert.equal(clampedEntry.delta_balance, 15000);
    assert.equal(clampedEntry.delta_withdrawn, -5000, "Phải ghi đúng -5000 (số thực trừ) thay vì -15000");

    // 12. ĐỐI SOÁT 100% TOÀN HỆ THỐNG (0đ lệch trên mọi user & mọi bucket)
    await assertFullReconciliation(db);
  } finally {
    await db.close();
  }
});
