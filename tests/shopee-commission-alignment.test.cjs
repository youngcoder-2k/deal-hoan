const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./helpers/load-ts.cjs');

test('Shopee commission alignment: Huy Thanh gold (56054818987) calculates exact 80.021đ gross and 62.673đ net after 11% tax', () => {
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

  // Sau khi trừ 11% thuế & phí sàn: hoa hồng net = 80.021 * 0.89 = 71.219đ
  // Khách nhận 88% của 71.219đ = 62.673đ
  assert.equal(boosted.cashbackAmount, 62673, 'User cashback must be exactly 62.673đ (88% of 71.219đ net)');
  assert.equal(boosted.finalRate, 6.3, 'Cashback rate must be 6.3%');
});

test('Shopee commission alignment: Wood Decor mirror (26643750654) calculates exact 41.698đ gross and 32.658đ net after 11% tax', () => {
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

  // Sau khi trừ 11% thuế & phí sàn: hoa hồng net = 41.698 * 0.89 = 37.111đ
  // Khách nhận 88% của 37.111đ = 32.658đ
  assert.equal(boosted.cashbackAmount, 32658, 'User cashback must be exactly 32.658đ (88% of 37.111đ net)');
  assert.equal(boosted.finalRate, 4.7, 'Cashback rate must be 4.7%');
});

test('Wallet settlement alignment: imported CSV orders match paste-link calculation exactly', () => {
  const { parseShopeeConversionReport } = loadTs({})('lib/deals/shopee-import.ts');

  const csv = `Order ID,Sub ID,Mã Sản Phẩm,Hoa Hồng,Trạng Thái
ORD001,dh12345678123412341234123456789abc,56054818987,80.021,completed
ORD002,dh87654321432143214321432109876cba,26643750654,41.698,completed`;

  const report = parseShopeeConversionReport(csv, { safetyMarginPercent: 12 });
  assert.equal(report.validOrders.length, 2);
  assert.equal(report.validOrders[0].commissionAmount, 80021);
  assert.equal(report.validOrders[0].cashbackAmount, 62673, 'Wallet credit for Huy Thanh must match 62.673đ (after tax)');
  assert.equal(report.validOrders[1].commissionAmount, 41698);
  assert.equal(report.validOrders[1].cashbackAmount, 32658, 'Wallet credit for Mirror must match 32.658đ (after tax)');
});

test('Single config parameter: userCashbackPercent supports 1 decimal place (e.g. 86.8%) and auto-calculates profit', () => {
  const { boostCashbackRate, normalizeBoosterSettings } = loadTs({})('lib/deals/cashback-booster.ts');
  const { parseShopeeConversionReport } = loadTs({})('lib/deals/shopee-import.ts');

  // 1. normalizeBoosterSettings
  const normalized = normalizeBoosterSettings({ userCashbackPercent: 86.8 });
  assert.equal(normalized.userCashbackPercent, 86.8, 'User percent must be 86.8%');
  assert.equal(normalized.safetyMarginPercent, 13.2, 'DealHoàn profit must be 13.2%');

  // 2. boostCashbackRate with 86.8% (sau trừ thuế 11%)
  const huyThanhGross = 80021;
  const netComm = Math.round(huyThanhGross * 0.89); // 71219đ
  const price = 989040;
  const boosted = boostCashbackRate(
    Number(((huyThanhGross / price) * 100).toFixed(2)),
    price,
    huyThanhGross,
    { userCashbackPercent: 86.8 }
  );

  const expectedUserCashback = Math.round(netComm * 0.868); // 61.818đ
  assert.equal(boosted.cashbackAmount, expectedUserCashback, 'User cashback must be exactly 61.818đ (86.8% of 71.219đ net)');
  const dealHoanProfit = netComm - boosted.cashbackAmount;
  assert.equal(dealHoanProfit, 9401, 'DealHoàn net profit must be 9.401đ');

  // 3. parseShopeeConversionReport with userCashbackPercent: 86.8
  const csv = `Order ID,Sub ID,Mã Sản Phẩm,Hoa Hồng,Trạng Thái
ORD001,dh12345678123412341234123456789abc,56054818987,80.021,completed`;
  const report = parseShopeeConversionReport(csv, { userCashbackPercent: 86.8 });
  assert.equal(report.validOrders[0].cashbackAmount, 61818, 'CSV import must honor userCashbackPercent 86.8% on net');
});

test('Shopee real CSV export format: distinguishes Trạng thái hoa hồng from Hoa hồng sản phẩm', () => {
  const { parseShopeeConversionReport } = loadTs({})('lib/deals/shopee-import.ts');

  // Real format exported from affiliate.shopee.vn
  const realShopeeCsv = `Mã đơn hàng,Tên cửa hàng,Tên sản phẩm,Mã sản phẩm,Trạng thái đơn hàng,Trạng thái hoa hồng,Giá trị đơn hàng,Hoa hồng sản phẩm,Hoa hồng đơn hàng,Sub ID 1
2611039UXRQA3Q,Wood Decor,[KHÔNG LED] Gương Cánh Trượt,26643750654,Chờ duyệt,Chờ đối soát,490.566,41.698,0,dh668a48523510472f8fb2cfe6e8f5a58b`;

  const res = parseShopeeConversionReport(realShopeeCsv, { userCashbackPercent: 88.0 });
  assert.equal(res.validOrders.length, 1);
  assert.equal(res.validOrders[0].orderId, '2611039UXRQA3Q');
  assert.equal(res.validOrders[0].orderValue, 490566);
  assert.equal(res.validOrders[0].commissionAmount, 41698, 'Must correctly capture 41.698đ commission instead of 0đ from Trạng thái hoa hồng');
  assert.equal(res.validOrders[0].cashbackAmount, 32658, '88% of 37.111đ net must be 32.658đ');
});

test('Shopee CSV money parser: handles 4-decimal-places and comma decimal representations', () => {
  const { parseShopeeMoney } = loadTs({})('lib/deals/shopee-import.ts');
  assert.equal(parseShopeeMoney('41698,0000'), 41698);
  assert.equal(parseShopeeMoney('41698,00'), 41698);
  assert.equal(parseShopeeMoney('41.698,00'), 41698);
  assert.equal(parseShopeeMoney('250.000'), 250000);
  assert.equal(parseShopeeMoney('250,000'), 250000);
  assert.equal(parseShopeeMoney('0,00'), 0);
  assert.equal(parseShopeeMoney('0,0000'), 0);
});
