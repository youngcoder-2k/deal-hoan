import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import { recordCashbackOrder } from "@/lib/deals/cashback";
import { parseShopeeConversionReport, type ParsedShopeeOrder } from "@/lib/deals/shopee-import";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền thực hiện. Yêu cầu quyền Admin." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    let ordersToProcess: ParsedShopeeOrder[] = [];

    // Option A: Raw CSV content passed
    if (typeof body.csvContent === "string" && body.csvContent.trim()) {
      const parsed = parseShopeeConversionReport(body.csvContent);
      ordersToProcess = parsed.validOrders;
      if (body.includeUnmatched && parsed.unmatchedOrders.length > 0) {
        ordersToProcess = [...ordersToProcess, ...parsed.unmatchedOrders];
      }
    }
    // Option B: Array of parsed orders passed directly
    else if (Array.isArray(body.orders)) {
      ordersToProcess = body.orders;
    }

    if (!ordersToProcess.length) {
      return NextResponse.json(
        { error: "Không tìm thấy đơn hàng hợp lệ nào để xử lý nạp tiền." },
        { status: 400 }
      );
    }

    let successCount = 0;
    let failedCount = 0;
    let totalCommissionRecorded = 0;
    let totalCashbackRecorded = 0;
    const matchedUserSet = new Set<string>();
    const results: Array<{ orderId: string; success: boolean; error?: string }> = [];

    for (const order of ordersToProcess) {
      try {
        const res = await recordCashbackOrder({
          orderId: order.orderId,
          subId: order.subId,
          userId: order.userId || undefined,
          platform: "Shopee",
          productName: order.productName,
          orderValue: order.orderValue,
          commissionAmount: order.commissionAmount,
          cashbackAmount: order.cashbackAmount,
          status: order.status,
          note: `Import từ file Báo cáo Shopee (${new Date().toLocaleDateString("vi-VN")})`,
          orderedAt: order.orderedAt,
        });

        if (res.success && res.order) {
          successCount++;
          totalCommissionRecorded += res.order.commission_amount || 0;
          totalCashbackRecorded += res.order.cashback_amount || 0;
          if (res.order.user_id) {
            matchedUserSet.add(res.order.user_id);
          }
          results.push({ orderId: order.orderId, success: true });
        } else {
          failedCount++;
          results.push({ orderId: order.orderId, success: false, error: res.error });
        }
      } catch (err: unknown) {
        failedCount++;
        const msg = err instanceof Error ? err.message : "Internal error";
        results.push({ orderId: order.orderId, success: false, error: msg });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Đã nạp thành công ${successCount}/${ordersToProcess.length} đơn hàng vào ví của ${matchedUserSet.size} thành viên!`,
      summary: {
        totalProcessed: ordersToProcess.length,
        successCount,
        failedCount,
        matchedUsersCount: matchedUserSet.size,
        totalCommission: totalCommissionRecorded,
        totalCashback: totalCashbackRecorded,
        netProfitMargin:
          totalCommissionRecorded > 0
            ? Math.round(((totalCommissionRecorded - totalCashbackRecorded) / totalCommissionRecorded) * 100)
            : 0,
      },
      results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
