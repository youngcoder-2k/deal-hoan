const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./helpers/load-ts.cjs');

test('parseShopeeDate parses DD-MM-YYYY, DD/MM/YYYY, ISO, and Vietnamese timestamps', () => {
  const { parseShopeeDate } = loadTs({})('lib/deals/shopee-import.ts');

  const d1 = parseShopeeDate('06-11-2026');
  assert.equal(d1.getDate(), 6);
  assert.equal(d1.getMonth(), 10); // Nov (0-indexed)
  assert.equal(d1.getFullYear(), 2026);

  const d2 = parseShopeeDate('04/11/2026 01:42');
  assert.equal(d2.getDate(), 4);
  assert.equal(d2.getMonth(), 10);
  assert.equal(d2.getHours(), 1);
  assert.equal(d2.getMinutes(), 42);

  const d3 = parseShopeeDate('2026-11-03T07:14:00Z');
  assert.equal(d3.getFullYear(), 2026);
});

test('Shopee CSV Import: Orders within 15-day hold period must remain in pending (Chờ duyệt)', () => {
  const { parseShopeeConversionReport } = loadTs({})('lib/deals/shopee-import.ts');

  // Case 1: Đơn của Thảo Hà (2611039UJRDH19) đặt ngày 03/11/2026 (cách đây 4 ngày < 15 ngày)
  const recentCsv = `Mã đơn hàng,Thời gian đặt hàng,Sub_ID,Tên sản phẩm,Giá trị đơn hàng (VND),Hoa hồng ước tính (VND),Trạng thái đơn hàng
2611039UJRDH19,2026-11-03 07:14,dh61f113c93212470f80bb111222333444,Sản phẩm Shopee,800415,80021,Hoàn thành`;

  const report = parseShopeeConversionReport(recentCsv, { userCashbackPercent: 88.0 });
  assert.equal(report.validOrders.length, 1);
  const ord = report.validOrders[0];
  assert.equal(ord.orderId, '2611039UJRDH19');
  assert.equal(ord.status, 'pending', 'Đơn hàng mới hoàn thành 4 ngày trước bắt buộc phải ở trạng thái pending (Chờ đối soát T+15)');
  assert.equal(ord.isHoldPeriod, true);
  assert.match(ord.note, /Chờ đối soát T\+15/);
});

test('Shopee CSV Import: Orders older than 15 days can be marked completed', () => {
  const { parseShopeeConversionReport } = loadTs({})('lib/deals/shopee-import.ts');

  // Case 2: Đơn đã hoàn thành cách đây 25 ngày (> 15 ngày)
  const oldCsv = `Mã đơn hàng,Thời gian đặt hàng,Sub_ID,Tên sản phẩm,Giá trị đơn hàng (VND),Hoa hồng ước tính (VND),Trạng thái đơn hàng
241010SHP99999,2026-10-10 14:22,dh61f113c93212470f80bb111222333444,Áo Polo Nam,240000,24000,Hoàn thành`;

  const report = parseShopeeConversionReport(oldCsv, { userCashbackPercent: 88.0 });
  assert.equal(report.validOrders.length, 1);
  const ord = report.validOrders[0];
  assert.equal(ord.status, 'completed', 'Đơn hàng hoàn thành trên 15 ngày được duyệt completed');
});

test('Shopee CSV Import: Respects Trạng thái hoa hồng "Chờ đối soát" and "Đã hủy"', () => {
  const { parseShopeeConversionReport } = loadTs({})('lib/deals/shopee-import.ts');

  const csv = `Mã đơn hàng,Thời gian đặt hàng,Sub_ID,Tên sản phẩm,Giá trị đơn hàng,Hoa hồng sản phẩm,Trạng thái đơn hàng,Trạng thái hoa hồng
ORD_PENDING,2026-10-01,dh61f113c93212470f80bb111222333444,Gương,490000,40000,Hoàn thành,Chờ đối soát
ORD_CANCELLED,2026-10-01,dh61f113c93212470f80bb111222333444,Đồ chơi,100000,10000,Hoàn thành,Từ chối`;

  const report = parseShopeeConversionReport(csv, { userCashbackPercent: 88.0 });
  assert.equal(report.validOrders[0].status, 'pending');
  assert.equal(report.validOrders[1].status, 'rejected');
});
