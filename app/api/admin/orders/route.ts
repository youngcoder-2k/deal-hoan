import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import { getSupabaseAdminClient } from "@/lib/auth/admin";
import { recordCashbackOrder } from "@/lib/deals/cashback";
import { isSyntheticTestOrder } from "@/lib/deals/shopee-import";
import { buildAdminSettlementNote } from "@/lib/deals/shopee-payout";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const status = searchParams.get("status");
    const userId = searchParams.get("userId");

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return NextResponse.json({ orders: [], total: 0 });
    }

    let query = supabaseAdmin
      .from("cashback_orders")
      .select("*")
      .order("ordered_at", { ascending: false });

    if (platform) query = query.eq("platform", platform);
    if (status) query = query.eq("status", status);
    if (userId) {
      const cleanHex = userId.replace(/-/g, "").toLowerCase();
      query = query.or(`user_id.eq.${userId},sub_id.ilike.%${cleanHex}%`);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.warn("admin orders fetch error:", error.message);
      return NextResponse.json({ orders: [], error: error.message });
    }

    const realOrders = (orders || []).filter((o: Record<string, unknown>) => !isSyntheticTestOrder(o));

    // Khi xem chi tiết user, gộp thêm các yêu cầu tra cứu đơn hàng bị thiếu từ khách (nếu chưa có trong cashback_orders)
    let combinedOrders = realOrders;
    if (userId) {
      const { data: claims } = await supabaseAdmin
        .from("cashback_order_claims")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (Array.isArray(claims) && claims.length > 0) {
        const existingKeys = new Set(realOrders.map((o: Record<string, unknown>) => `${o.platform}:${o.order_id}`));
        const unmatchedClaims = claims
          .filter((c: Record<string, unknown>) => !existingKeys.has(`${c.platform}:${c.order_id}`) && !isSyntheticTestOrder(c))
          .map((c: Record<string, unknown>) => ({
            ...c,
            status: "pending",
            commission_amount: 0,
            cashback_amount: 0,
            ordered_at: c.created_at,
            note: "Khách tự gửi tra cứu đơn (chưa có đối soát từ Shopee)",
          }));
        combinedOrders = [...realOrders, ...unmatchedClaims];
      }
    }

    return NextResponse.json({
      success: true,
      orders: combinedOrders,
      total: combinedOrders.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Admin tạo đơn hàng hoàn tiền thủ công hoặc mô phỏng đơn test
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền thực hiện." }, { status: 403 });
    }

    const body = await request.json();
    const {
      userId,
      orderId,
      platform = "Shopee",
      productName = "Đơn hàng thử nghiệm DealHoàn",
      orderValue,
      commissionAmount,
      cashbackAmount,
      status = "pending",
      note = "Đơn test do Admin tạo",
    } = body;

    if (!userId) {
      return NextResponse.json({ error: "Thiếu userId để tạo đơn hoàn tiền." }, { status: 400 });
    }

    const result = await recordCashbackOrder({
      userId,
      orderId,
      platform,
      productName,
      orderValue: Number(orderValue),
      commissionAmount: Number(commissionAmount),
      cashbackAmount: cashbackAmount === undefined ? undefined : Number(cashbackAmount),
      status,
      note,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Đã tạo đơn hàng hoàn tiền thành công!",
      order: result.order,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Admin duyệt (completed) hoặc từ chối (rejected) 1 hoặc nhiều đơn hàng
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await checkAdminApiAuth(request);
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Không có quyền thực hiện." }, { status: 403 });
    }

    const body = await request.json();
    const { orderId, orderIds, platform = "Shopee", status, note } = body;

    const targetIds: string[] = Array.from(
      new Set(
        (Array.isArray(orderIds) ? orderIds : orderId ? [orderId] : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    );

    if (targetIds.length === 0 || !status) {
      return NextResponse.json({ error: "Thiếu orderId hoặc status cần cập nhật." }, { status: 400 });
    }

    const db = getSupabaseAdminClient();
    if (!db) {
      return NextResponse.json({ error: "Chưa cấu hình kết nối cơ sở dữ liệu." }, { status: 500 });
    }

    const { data: existingRows, error: fetchError } = await db
      .from("cashback_orders")
      .select("user_id,order_id,order_value,commission_amount,cashback_amount,note")
      .in("order_id", targetIds)
      .eq("platform", platform);

    if (fetchError || !existingRows || existingRows.length === 0) {
      return NextResponse.json({ error: "Chưa tìm thấy đơn hàng cần cập nhật." }, { status: 404 });
    }

    const updatedOrders = [];
    const failedOrders: Array<{ orderId: string; error: string }> = [];

    for (const row of existingRows) {
      const defaultNote =
        status === "completed"
          ? "Admin duyệt giải ngân Shopee"
          : `Admin cập nhật trạng thái sang ${status}`;
      const finalNote =
        status === "completed"
          ? buildAdminSettlementNote(typeof note === "string" && note.trim() ? note : defaultNote, row.note)
          : note || defaultNote;

      const comm = Number(row.commission_amount);
      const result = await recordCashbackOrder({
        userId: row.user_id,
        orderId: row.order_id,
        platform,
        orderValue: Number(row.order_value) || 0,
        ...(Number.isSafeInteger(comm) && comm >= 0 ? { commissionAmount: comm } : {}),
        status,
        note: finalNote,
      });

      if (result.success && result.order) {
        updatedOrders.push(result.order);
      } else {
        failedOrders.push({
          orderId: row.order_id,
          error: result.error || "Không thể cập nhật đơn hàng.",
        });
      }
    }

    if (updatedOrders.length === 0) {
      return NextResponse.json(
        { error: failedOrders[0]?.error || "Không thể cập nhật đơn hàng.", failedOrders },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        updatedOrders.length === 1
          ? `Đã cập nhật đơn ${updatedOrders[0].order_id} sang trạng thái ${status}!`
          : `Đã duyệt thành công ${updatedOrders.length}/${targetIds.length} đơn hàng!`,
      updatedCount: updatedOrders.length,
      order: updatedOrders[0],
      orders: updatedOrders,
      failedOrders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
