const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./helpers/load-ts.cjs');

test('Shopee commission alignment: Huy Thanh gold (56054818987) calculates exact 80.021đ gross and 70.418đ net', () => {
  const { getShopeeCategoryRate } = loadTs({})('lib/deals/providers/hoanngay.ts');
  const { boostCashbackRate } = loadTs({})('lib/deals/cashback-booster.ts');

  const price = 989040;
  const sellerCommission = 19781;
  const categoryText = "Phụ Kiện & Trang Sức Nữ Quà Tặng Bính Ngọ Kim Chi Bảo LNNGUA 0.05 Chỉ Vàng 24k Huy Thanh Jewelry";
  
  const catRate = getShopeeCategoryRate(categoryText);
  const shopeeBase = Math.round(price * catRate);
  const totalGross = sellerCommission + shopeeBase;

  assert.equal(shopeeBase, 60240, 'Shopee base commission uncapped must be 60.240đ');
  assert.equal(totalGross, 80021, 'Total gross commission from Shopee must be 80.021đ');

  const boosted = boostCashbackRate(
    Number(((totalGross / price) * 100).toFixed(2)),
    price,
    totalGross,
    { safetyMarginPercent: 12, boostFactor: 1.0, maxBonusRate: 1.0, minBonusRate: 0.3, autoScaleWithUsers: false }
  );

  assert.equal(boosted.cashbackAmount, 70418, 'User cashback must be exactly 70.418đ (88% of 80.021đ)');
  assert.equal(boosted.finalRate, 7.1, 'Cashback rate must be 7.1%');
});

test('Shopee commission alignment: Wood Decor mirror (26643750654) calculates exact 41.698đ gross and 36.694đ net', () => {
  const { getShopeeCategoryRate } = loadTs({})('lib/deals/providers/hoanngay.ts');
  const { boostCashbackRate } = loadTs({})('lib/deals/cashback-booster.ts');

  const price = 699000;
  const sellerCommission = 16776;
  const categoryText = "Nhà Cửa & Đời Sống [KHÔNG LED] Gương Cánh Trượt Toàn Thân Có Đèn LED & Pegboard Gỗ Nội Thất Hiện Đại WOOD DECOR";
  
  const catRate = getShopeeCategoryRate(categoryText);
  const shopeeBase = Math.round(price * catRate);
  const totalGross = sellerCommission + shopeeBase;

  assert.equal(shopeeBase, 24922, 'Shopee base commission uncapped must be 24.922đ');
  assert.equal(totalGross, 41698, 'Total gross commission from Shopee must be 41.698đ');

  const boosted = boostCashbackRate(
    Number(((totalGross / price) * 100).toFixed(2)),
    price,
    totalGross,
    { safetyMarginPercent: 12, boostFactor: 1.0, maxBonusRate: 1.0, minBonusRate: 0.3, autoScaleWithUsers: false }
  );

  assert.equal(boosted.cashbackAmount, 36694, 'User cashback must be exactly 36.694đ (88% of 41.698đ)');
  assert.equal(boosted.finalRate, 5.2, 'Cashback rate must be 5.2%');
});

test('Wallet settlement alignment: imported CSV orders match paste-link calculation exactly', () => {
  const { parseShopeeConversionReport } = loadTs({})('lib/deals/shopee-import.ts');

  const csv = `Order ID,Sub ID,Mã Sản Phẩm,Hoa Hồng,Trạng Thái
ORD001,dh12345678123412341234123456789abc,56054818987,80.021,completed
ORD002,dh87654321432143214321432109876cba,26643750654,41.698,completed`;

  const report = parseShopeeConversionReport(csv, { safetyMarginPercent: 12 });
  assert.equal(report.validOrders.length, 2);
  assert.equal(report.validOrders[0].commissionAmount, 80021);
  assert.equal(report.validOrders[0].cashbackAmount, 70418, 'Wallet credit for Huy Thanh must match 70.418đ');
  assert.equal(report.validOrders[1].commissionAmount, 41698);
  assert.equal(report.validOrders[1].cashbackAmount, 36694, 'Wallet credit for Mirror must match 36.694đ');
});

test('Single config parameter: userCashbackPercent supports 1 decimal place (e.g. 86.8%) and auto-calculates profit', () => {
  const { boostCashbackRate, normalizeBoosterSettings } = loadTs({})('lib/deals/cashback-booster.ts');
  const { parseShopeeConversionReport } = loadTs({})('lib/deals/shopee-import.ts');

  // 1. normalizeBoosterSettings
  const normalized = normalizeBoosterSettings({ userCashbackPercent: 86.8 });
  assert.equal(normalized.userCashbackPercent, 86.8, 'User percent must be 86.8%');
  assert.equal(normalized.safetyMarginPercent, 13.2, 'DealHoàn profit must be 13.2%');

  // 2. boostCashbackRate with 86.8%
  const huyThanhGross = 80021;
  const price = 989040;
  const boosted = boostCashbackRate(
    Number(((huyThanhGross / price) * 100).toFixed(2)),
    price,
    huyThanhGross,
    { userCashbackPercent: 86.8 }
  );

  const expectedUserCashback = Math.round(huyThanhGross * 0.868); // 69.458đ
  assert.equal(boosted.cashbackAmount, expectedUserCashback, 'User cashback must be exactly 69.458đ (86.8% of 80.021đ)');
  const dealHoanProfit = huyThanhGross - boosted.cashbackAmount;
  assert.equal(dealHoanProfit, 10563, 'DealHoàn profit must be 10.563đ');

  // 3. parseShopeeConversionReport with userCashbackPercent: 86.8
  const csv = `Order ID,Sub ID,Mã Sản Phẩm,Hoa Hồng,Trạng Thái
ORD001,dh12345678123412341234123456789abc,56054818987,80.021,completed`;
  const report = parseShopeeConversionReport(csv, { userCashbackPercent: 86.8 });
  assert.equal(report.validOrders[0].cashbackAmount, 69458, 'CSV import must honor userCashbackPercent 86.8%');
});
