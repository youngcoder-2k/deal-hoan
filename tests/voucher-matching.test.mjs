import test from "node:test";
import assert from "node:assert/strict";
import { matchVouchersForProduct, evaluateCoupon } from "../lib/deals/matching.ts";
import { getDailyShopeeCoupons } from "../lib/deals/coupons-static.ts";

test("voucher matching logic: matches applicable vouchers for 300k Shopee product", () => {
  const coupons = getDailyShopeeCoupons();
  const price = 300000;
  const platform = "Shopee";

  const { matched, bestDiscount } = matchVouchersForProduct(price, platform, coupons);

  assert.ok(matched.length > 0, "Phải có danh sách voucher");
  assert.ok(bestDiscount > 0, "Phải tìm thấy mã giảm giá tốt nhất");

  const applicable = matched.filter((m) => m.isApplicable);
  assert.ok(applicable.length > 0, "Phải có ít nhất 1 mã thỏa mãn điều kiện");

  // Đơn 300k phải thỏa mãn mã Freeship
  const fsCoupon = applicable.find((m) => m.coupon.category === "freeship");
  assert.ok(fsCoupon, "Voucher Freeship phải áp dụng được cho đơn 300k");
});

test("voucher matching logic: rejects mall coupons for non-mall product", () => {
  const mallCoupon = {
    id: "test-mall",
    amount: "100K",
    unit: "giảm",
    title: "Mã Mall",
    condition: "Đơn từ 200K",
    code: "MALL100",
    color: "orange",
    category: "mall",
    platform: "Shopee Mall",
  };

  // Sản phẩm shop thường
  const evalNormal = evaluateCoupon(mallCoupon, 250000, false);
  assert.equal(evalNormal.isApplicable, false, "Shop thường không được áp mã Mall");
  assert.match(evalNormal.reason, /Shopee Mall/);

  // Sản phẩm Shopee Mall
  const evalMall = evaluateCoupon(mallCoupon, 250000, true);
  assert.equal(evalMall.isApplicable, true, "Shopee Mall phải áp được mã Mall");
});

test("voucher matching logic: returns all vouchers and calculates percentage discounts", () => {
  const coupons = getDailyShopeeCoupons();
  const price = 500000;
  const platform = "Shopee";

  const { matched, bestDiscount } = matchVouchersForProduct(price, platform, coupons);

  assert.equal(matched.length, coupons.length, "Phải giữ toàn bộ danh sách mã để người dùng dự phòng");
  assert.ok(bestDiscount > 0, "Phải tính được mức giảm");
  assert.ok(matched.some((m) => m.tier === "freeship"), "Phải có tầng Freeship");
});

test("voucher matching logic: filters out exhausted codes completely (usage >= 90%) and avoids tilde character", () => {
  const coupons = [
    {
      id: "v-exhausted",
      code: "EXHAUSTED92",
      amount: "50K",
      unit: "giảm",
      title: "Mã giảm 50k",
      condition: "Đơn từ 100K",
      color: "red",
      category: "toan_san",
      usagePercent: 92,
    },
    {
      id: "v-available",
      code: "AVAILABLE20",
      amount: "30K",
      unit: "giảm",
      title: "Mã giảm 30k",
      condition: "Đơn từ 100K",
      color: "red",
      category: "toan_san",
      usagePercent: 20,
    },
  ];

  const { matched } = matchVouchersForProduct(200000, "Shopee", coupons);
  assert.equal(matched.length, 1, "Mã có usage >= 90% phải bị loại bỏ hoàn toàn, không hiển thị");
  assert.equal(matched[0].coupon.code, "AVAILABLE20");
  assert.equal(matched[0].slotLabel.includes("~"), false, "Tuyệt đối không có ký tự ~ gây hiểu nhầm âm %");
  assert.equal(matched[0].slotLabel, "Còn nhiều (80% lượt)");
});
