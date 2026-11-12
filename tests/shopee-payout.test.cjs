const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./helpers/load-ts.cjs');

test('parseShopeeConversionReport tags Shopee HT completion date in note for payout reconciliation', () => {
  const { parseShopeeConversionReport } = loadTs({})('lib/deals/shopee-import.ts');
  const csv = [
    'ID đơn hàng,Trạng thái đặt hàng,Thời Gian Đặt Hàng,Thời gian hoàn thành,Tên Item,Giá trị đơn hàng (₫),Tổng hoa hồng đơn hàng(₫),Sub_id1',
    '261103BSGMPYTT,Hoàn thành,2026-11-03 18:42:39,2026-11-05 12:05:55,Ximo 300ml,136080,20412,dh0b8c67b1327246d084db86a8ad1065cb',
  ].join('\n');

  const report = parseShopeeConversionReport(csv, { userCashbackPercent: 88.0 });
  assert.equal(report.validOrders.length, 1);
  const ord = report.validOrders[0];
  assert.match(ord.note, /Shopee HT 05\/11\/2026/);
  assert.match(ord.note, /Chờ đối soát T\+15/);

  const { extractShopeeCompletedDateKey, extractShopeeCompletedLabel } = loadTs({})('lib/deals/shopee-payout.ts');
  assert.equal(extractShopeeCompletedDateKey(ord), '2026-11-05');
  assert.equal(extractShopeeCompletedLabel(ord), '05/11/2026');
});

test('reconcilePayoutOrders filters by Shopee completion date range and computes per-user available balances', () => {
  const { reconcilePayoutOrders, buildAdminSettlementNote, isAdminSettledNote } = loadTs({})('lib/deals/shopee-payout.ts');

  const orders = [
    {
      orderId: '261103BSGMPYTT',
      userId: '0b8c67b1-3272-46d0-84db-86a8ad1065cb',
      commissionAmount: 20412,
      status: 'pending',
      orderedAt: '2026-11-03T11:42:39.000Z',
      note: 'Shopee HT 05/11/2026 · Chờ đối soát T+15 (dự kiến khả dụng: 20/11/2026)',
    },
    {
      orderId: '2611039UJRDH19',
      userId: '61f113c9-8070-48f0-a9a9-43b8befc5686',
      commissionAmount: 80021,
      status: 'pending',
      orderedAt: '2026-11-02T17:14:18.000Z',
      note: 'Shopee HT 06/11/2026 · Chờ đối soát T+15 (dự kiến khả dụng: 21/11/2026)',
    },
    {
      orderId: '261107KVSDXB5H',
      userId: '668a4852-3510-472f-8fb2-cfe6e8f5a58b',
      commissionAmount: 18343,
      status: 'pending',
      orderedAt: '2026-11-06T17:02:33.000Z',
      note: 'Shopee HT 08/11/2026 · Chờ đối soát T+15 (dự kiến khả dụng: 23/11/2026)',
    },
  ];

  const summary = reconcilePayoutOrders(orders, {
    userCashbackPercent: 88.0,
    fromDate: '2026-11-05',
    toDate: '2026-11-06',
    dateField: 'completedAt',
    onlyPending: true,
  });

  assert.equal(summary.orders.length, 2);
  assert.equal(summary.users.length, 2);
  assert.equal(summary.users[0].userId, '61f113c9-8070-48f0-a9a9-43b8befc5686');
  assert.equal(summary.users[0].cashbackAmount, 62673);
  assert.equal(summary.users[1].userId, '0b8c67b1-3272-46d0-84db-86a8ad1065cb');
  assert.equal(summary.users[1].cashbackAmount, 15987);
  assert.equal(summary.totalUserCashback, 78660);
  assert.equal(summary.totalNetCommission, 89386);

  const settledNote = buildAdminSettlementNote('Admin duyệt giải ngân Shopee', orders[0].note);
  assert.equal(settledNote, 'Admin duyệt giải ngân Shopee (Shopee HT 05/11/2026)');
  assert.equal(isAdminSettledNote(settledNote), true);
});
