const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./helpers/load-ts.cjs');

test('parseShopeeDate parses DD-MM-YYYY, DD/MM/YYYY, ISO, and Vietnamese timestamps accurately across timezones', () => {
  const { parseShopeeDate } = loadTs({})('lib/deals/shopee-import.ts');

  const d1 = parseShopeeDate('06-11-2026');
  assert.equal(d1.toISOString(), '2026-11-05T17:00:00.000Z'); // 06/11 00:00 +07:00

  const d2 = parseShopeeDate('04/11/2026 01:42');
  assert.equal(d2.toISOString(), '2026-11-03T18:42:00.000Z'); // 04/11 01:42 +07:00

  const d3 = parseShopeeDate('2026-11-03T07:14:00Z');
  assert.equal(d3.toISOString(), '2026-11-03T07:14:00.000Z');
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

test('autoSettleHoldPeriodOrders transitions orders > 15 days to completed and reconciles cashback', async () => {
  const { autoSettleHoldPeriodOrders } = loadTs({
    '@/lib/supabase/service': { getSupabaseServiceClient: () => mockDb },
    '@/lib/deals/affiliate': { parseUserIdFromSubId: () => '61f113c9-3212-470f-80bb-111222333444' },
    '@/lib/deals/cashback-booster': { getBoosterSettingsSync: () => ({ safetyMarginPercent: 12, userCashbackPercent: 88 }) },
  })('lib/deals/cashback.ts');

  const recorded = [];
  const mockDb = {
    from: (table) => {
      if (table === 'cashback_orders') {
        return {
          select: () => ({
            eq: (col1, val1) => ({
              limit: async () => {
                if (val1 === 'pending') {
                  return {
                    data: [
                      // Order 1: Đã qua 20 ngày -> cần chuyển sang completed
                      {
                        order_id: 'ORD_OLD_15',
                        sub_id: 'dh61f113c93212470f80bb111222333444',
                        user_id: '61f113c9-3212-470f-80bb-111222333444',
                        platform: 'Shopee',
                        order_value: 100000,
                        commission_amount: 10000,
                        cashback_amount: 8800,
                        status: 'pending',
                        ordered_at: new Date(Date.now() - 20 * 86400 * 1000).toISOString(),
                      },
                      // Order 2: Mới đặt 3 ngày trước nhưng cashback_amount bị tính theo gross -> cần reconcile
                      {
                        order_id: 'ORD_RECENT_3',
                        sub_id: 'dh61f113c93212470f80bb111222333444',
                        user_id: '61f113c9-3212-470f-80bb-111222333444',
                        platform: 'Shopee',
                        order_value: 100000,
                        commission_amount: 10000,
                        cashback_amount: 8800, // Cần giảm về 7832 (10000 * 0.89 * 0.88)
                        status: 'pending',
                        ordered_at: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
                      },
                    ],
                  };
                }
                return { data: [] };
              },
              eq: (col2, val2) => ({
                order: () => ({
                  limit: async () => ({ data: [] }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    },
    rpc: async (fn, { p_order }) => {
      recorded.push(p_order);
      return { data: { id: 'uuid', ...p_order }, error: null };
    },
  };

  const result = await autoSettleHoldPeriodOrders({ db: mockDb });
  assert.equal(result.settledCount, 1, 'Đơn > 15 ngày phải được tự động duyệt completed');
  assert.equal(result.reconciledCount, 1, 'Đơn < 15 ngày có cashback gộp phải được chuẩn hóa sau thuế');

  // Verify recorded order 1 is completed
  const settled = recorded.find((r) => r.order_id === 'ORD_OLD_15');
  assert.ok(settled);
  assert.equal(settled.status, 'completed');

  // Verify recorded order 2 is pending but cashback_amount capped at after-tax net
  const reconciled = recorded.find((r) => r.order_id === 'ORD_RECENT_3');
  assert.ok(reconciled);
  assert.equal(reconciled.status, 'pending');
  assert.equal(reconciled.cashback_amount, 7832); // 10000 * 0.89 * 0.88 = 7832
});

test('Shopee CSV Import: merges multi-item split rows with same orderId without zero-overwrite or double-counting', () => {
  const { parseShopeeConversionReport } = loadTs({})('lib/deals/shopee-import.ts');

  // Case 1: Real Shopee case (261106KQ9Q3ZXY) - Item 1 has 12.357đ, Item 2 (addon/gift) has 0đ
  const splitZeroCsv = `Mã đơn hàng,Thời gian đặt hàng,Tên sản phẩm,Mã sản phẩm,Giá trị đơn hàng,Hoa hồng sản phẩm,Trạng thái đơn hàng,Sub ID 1
261106KQ9Q3ZXY,2026-11-06 22:24:00,Sản phẩm chính,111,150000,12357,Hoàn thành,dh668a48523510472f8fb2cfe6e8f5a58b
261106KQ9Q3ZXY,2026-11-06 22:24:00,Quà tặng 0đ,222,0,0,Hoàn thành,dh668a48523510472f8fb2cfe6e8f5a58b`;

  const res1 = parseShopeeConversionReport(splitZeroCsv, { userCashbackPercent: 88.0 });
  assert.equal(res1.validOrders.length, 1, 'Phải gộp thành 1 đơn hàng duy nhất thay vì ra 2 dòng trùng');
  assert.equal(res1.validOrders[0].orderId, '261106KQ9Q3ZXY');
  assert.equal(res1.validOrders[0].commissionAmount, 12357, 'Không được để dòng quà tặng 0đ ghi đè mất hoa hồng 12.357đ');
  assert.equal(res1.validOrders[0].cashbackAmount, 9678, 'Tiền hoàn phải đạt chuẩn 9.678đ (12357 * 0.89 * 0.88)');
  assert.equal(res1.validOrders[0].orderedAt, '2026-11-06T15:24:00.000Z', 'Thời gian VN 22:24 06/11 phải chuẩn hóa sang 15:24 UTC để DB không bị lệch +7 tiếng');

  // Case 2: Repeated "Tổng hoa hồng đơn hàng" across multiple items must NOT double count
  const repeatedTotalCsv = `Mã đơn hàng,Thời gian đặt hàng,Tên sản phẩm,Mã sản phẩm,Giá trị đơn hàng,Hoa hồng sản phẩm,Tổng hoa hồng đơn hàng,Trạng thái đơn hàng,Sub ID 1
ORD_MULTI,06-11-2026 22:34,Áo thun,101,100000,8000,12000,Hoàn thành,dh668a48523510472f8fb2cfe6e8f5a58b
ORD_MULTI,06-11-2026 22:34,Quần short,102,50000,4000,12000,Hoàn thành,dh668a48523510472f8fb2cfe6e8f5a58b`;

  const res2 = parseShopeeConversionReport(repeatedTotalCsv, { userCashbackPercent: 88.0 });
  assert.equal(res2.validOrders.length, 1);
  assert.equal(res2.validOrders[0].commissionAmount, 12000, 'Tổng hoa hồng đơn hàng lặp lại không được cộng đúp thành 24.000đ');
  assert.equal(res2.validOrders[0].orderedAt, '2026-11-06T15:34:00.000Z');

  // Case 3: Distinct items without orderTotalCommission sum cleanly, exact duplicates deduped
  const distinctItemsCsv = `Mã đơn hàng,Thời gian đặt hàng,Tên sản phẩm,Mã sản phẩm,Giá trị đơn hàng,Hoa hồng sản phẩm,Trạng thái đơn hàng,Sub ID 1
ORD_SUM,2026-11-07 10:00,Món 1,201,100000,10000,Hoàn thành,dh668a48523510472f8fb2cfe6e8f5a58b
ORD_SUM,2026-11-07 10:00,Món 2,202,50000,5000,Hoàn thành,dh668a48523510472f8fb2cfe6e8f5a58b
ORD_SUM,2026-11-07 10:00,Món 2,202,50000,5000,Hoàn thành,dh668a48523510472f8fb2cfe6e8f5a58b`;

  const res3 = parseShopeeConversionReport(distinctItemsCsv, { userCashbackPercent: 88.0 });
  assert.equal(res3.validOrders.length, 1);
  assert.equal(res3.validOrders[0].commissionAmount, 15000, 'Cộng tổng các món khác nhau (10k + 5k) và khử dòng lặp y hệt');
});
