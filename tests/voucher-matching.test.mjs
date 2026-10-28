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

  // Đơn 300k phải thỏa mãn đơn từ 150k (Facebook, Instagram)
  const fbCoupon = applicable.find((m) => m.coupon.code === "FACEBOOK250");
  assert.ok(fbCoupon, "FACEBOOK250 phải áp dụng được cho đơn 300k");
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
