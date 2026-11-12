import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { parseUserIdFromSubId } from "@/lib/deals/affiliate";
import { getBoosterSettingsSync } from "@/lib/deals/cashback-booster";
import { isAdminSettledNote } from "@/lib/deals/shopee-payout";

export interface CashbackOrderRecord {
  id: string;
  user_id: string;
  order_id: string;
  platform: "Shopee" | "ShopeeFood" | "TikTok Shop" | "Lazada";
  product_name?: string | null;
  product_image?: string | null;
  order_value: number;
  commission_amount: number;
  cashback_amount: number;
  cashback_rate?: number;
  status: "pending" | "completed" | "rejected";
  sub_id?: string | null;
  note?: string | null;
  ordered_at: string;
  confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordCashbackOrderParams {
  orderId: string;
  subId?: string;
  userId?: string;
  platform?: "Shopee" | "ShopeeFood" | "TikTok Shop" | "Lazada";
  productName?: string;
  productImage?: string;
  orderValue?: number;
  commissionAmount?: number;
  cashbackAmount?: number;
  status?: "pending" | "completed" | "rejected";
  note?: string;
  orderedAt?: string;
}


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Legacy short reference codes are accepted only when they resolve unambiguously. */
export async function resolveUserIdFromSubId(subId?: string | null, providedUserId?: string | null): Promise<string | null> {
  const provided = providedUserId?.trim();
  const parsed = parseUserIdFromSubId(subId);
  if (provided && !UUID.test(provided)) return null;
  if (!parsed) return provided || null;
  if (UUID.test(parsed)) return !provided || parsed.toLowerCase() === provided.toLowerCase() ? parsed : null;
  if (!/^[0-9a-f]{8,32}$/i.test(parsed)) return null;
  const db = getSupabaseServiceClient();
  if (!db) return null;
  let match: string | null = null;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return null;
    for (const user of data.users) {
      if (user.id.toLowerCase().startsWith(parsed.toLowerCase())) {
        if (match && match !== user.id) return null;
        match = user.id;
      }
    }
    if (data.users.length < 100) return match && (!provided || provided === match) ? match : null;
  }
  return null; // A truncated user directory is not proof of a unique match.
}

/** The RPC commits the order and wallet delta together; retrying never credits twice. */
export async function recordCashbackOrder(params: RecordCashbackOrderParams): Promise<{
  success: boolean; order?: CashbackOrderRecord; error?: string;
}> {
  const orderId = params.orderId?.trim();
  if (!orderId || orderId.length > 128) return { success: false, error: "Mã đơn hàng không hợp lệ." };
  const db = getSupabaseServiceClient();
  if (!db) return { success: false, error: "Chưa cấu hình kết nối ghi nhận đơn hàng. Vui lòng liên hệ quản trị viên." };
  const userId = await resolveUserIdFromSubId(params.subId, params.userId);
  if (!userId) return { success: false, error: "Mã tracking không khớp tài khoản khách hàng." };
  const platform = params.platform || "Shopee";
  const status = params.status || "pending";
  if (!["Shopee", "ShopeeFood", "TikTok Shop", "Lazada"].includes(platform) || !["pending", "completed", "rejected"].includes(status)) {
    return { success: false, error: "Trạng thái hoặc nền tảng không hợp lệ." };
  }
  for (const value of [params.orderValue, params.commissionAmount, params.cashbackAmount]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) return { success: false, error: "Giá trị tiền phải là số nguyên không âm." };
  }
  // Never invent commission from order value. Status-only updates retain stored amounts.
  const margin = getBoosterSettingsSync().safetyMarginPercent;
  if (!Number.isFinite(margin) || margin < 0 || margin > 100) return { success: false, error: "Cấu hình tỷ lệ hoàn tiền không hợp lệ." };
  if (params.cashbackAmount !== undefined && params.commissionAmount === undefined) return { success: false, error: "Cần hoa hồng đối soát để cập nhật khoản hoàn." };
  // Bóc tách thuế & phí: 10% TNCN + 1% phí dịch vụ sàn (hoa hồng thực nhận là 89%)
  const netCommission = params.commissionAmount === undefined ? undefined : Math.round(params.commissionAmount * 0.89);
  const limit = netCommission === undefined ? undefined : Math.round(netCommission * (100 - margin) / 100);
  const cashback = limit === undefined ? undefined : Math.min(params.cashbackAmount ?? limit, limit);
  const { data, error } = await db.rpc("record_cashback_order", { p_order: {
    user_id: userId, order_id: orderId, platform, status,
    product_name: params.productName, product_image: params.productImage,
    order_value: params.orderValue, commission_amount: params.commissionAmount,
    cashback_amount: cashback, sub_id: params.subId || `u_${userId}`,
    note: params.note, ordered_at: params.orderedAt,
  } });
  if (error || !data) {
    console.error("[cashback] atomic record failed", { code: error?.code || "empty_result" });
    return { success: false, error: "Chưa lưu được đơn và tiền hoàn. Hệ thống cần đồng bộ lại; không ghi nhận thành công khi ví lỗi." };
  }
  return { success: true, order: data as CashbackOrderRecord };
}

export async function getUserCashbackOrders(userId: string): Promise<CashbackOrderRecord[]> {
  const db = getSupabaseServiceClient();
  if (!db) throw new Error("Cashback database is not configured");
  const { data, error } = await db.from("cashback_orders").select("*").eq("user_id", userId).order("ordered_at", { ascending: false });
  if (error) throw new Error("Cashback orders could not be loaded");
  return data || [];
}

/**
 * Tự động đối soát và chuyển trạng thái đơn hàng Shopee T+15:
 * 1. Tự động chuyển các đơn 'pending' đã qua ít nhất 15 ngày sang 'completed':
 *    - Giải phóng tiền từ "Chờ hoàn" sang "Số dư khả dụng" trong ví người dùng để khách có thể rút tiền.
 *    - Chuẩn hóa khoản hoàn tiền dựa trên hoa hồng net sau thuế 11%.
 * 2. Chuẩn hóa số dư các đơn pending cũ nếu trước đó lỡ tính theo hoa hồng gộp (chưa trừ 11% thuế).
 * 3. Bảo toàn quỹ nền tảng: Nếu đơn Shopee nào ở 'completed' nhưng chưa đủ 15 ngày (và không phải do admin duyệt tay)
 *    thì đưa về 'pending' để ngăn ngừa rủi ro khách rút tiền trước khi Shopee thanh toán cho DealHoàn.
 */
export async function autoSettleHoldPeriodOrders(options: {
  holdDays?: number;
  db?: ReturnType<typeof getSupabaseServiceClient>;
  now?: number;
} = {}): Promise<{
  settledCount: number;
  revertedCount: number;
  reconciledCount: number;
}> {
  const db = options.db || getSupabaseServiceClient();
  if (!db) return { settledCount: 0, revertedCount: 0, reconciledCount: 0 };

  const holdDays = options.holdDays ?? 15;
  const HOLD_MS = holdDays * 24 * 60 * 60 * 1000;
  const now = options.now ?? Date.now();
  let settledCount = 0;
  let revertedCount = 0;
  let reconciledCount = 0;

  try {
    // 1. Quét các đơn pending
    const { data: pendingOrders } = await db
      .from("cashback_orders")
      .select("*")
      .eq("status", "pending")
      .limit(100);

    if (Array.isArray(pendingOrders)) {
      for (const ord of pendingOrders) {
        const note = String(ord.note || "").toLowerCase();
        // Không tự duyệt nếu đơn đã có ghi chú bị hủy/từ chối từ Shopee
        if (note.includes("hủy") || note.includes("huỷ") || note.includes("từ chối") || note.includes("reject")) {
          continue;
        }

        const ordDate = new Date(ord.ordered_at || ord.created_at || "").getTime();
        const hasPassed15Days = !isNaN(ordDate) && (now - ordDate >= HOLD_MS);

        if (hasPassed15Days) {
          // Đã đủ 15 ngày -> Tự động chuyển sang 'completed' (chuyển tiền vào số dư khả dụng cho khách)
          const res = await recordCashbackOrder({
            orderId: ord.order_id,
            subId: ord.sub_id,
            userId: ord.user_id,
            platform: ord.platform,
            orderValue: Number(ord.order_value),
            commissionAmount: Number(ord.commission_amount),
            status: "completed",
            note: "Tự động duyệt sau 15 ngày đối soát Shopee T+15",
          });
          if (res.success) settledCount++;
        } else {
          // Chưa đủ 15 ngày: Chuẩn hóa lại cashbackAmount nếu đơn cũ trước đó bị tính theo gross
          const comm = Number(ord.commission_amount) || 0;
          const currentCashback = Number(ord.cashback_amount) || 0;
          if (comm > 0) {
            const netComm = Math.round(comm * 0.89);
            const safeMaxCashback = Math.round(netComm * 0.88);
            if (currentCashback > safeMaxCashback) {
              const res = await recordCashbackOrder({
                orderId: ord.order_id,
                subId: ord.sub_id,
                userId: ord.user_id,
                platform: ord.platform,
                orderValue: Number(ord.order_value),
                commissionAmount: comm,
                cashbackAmount: safeMaxCashback,
                status: "pending",
                note: ord.note || "Chuẩn hóa tiền hoàn sau thuế 11%",
              });
              if (res.success) reconciledCount++;
            }
          }
        }
      }
    }

    // 2. Bảo toàn quỹ: Nếu đơn Shopee completed nhưng chưa đủ 15 ngày và không phải admin duyệt tay
    const { data: prematureOrders } = await db
      .from("cashback_orders")
      .select("*")
      .eq("status", "completed")
      .eq("platform", "Shopee")
      .order("created_at", { ascending: false })
      .limit(50);

    if (Array.isArray(prematureOrders)) {
      for (const ord of prematureOrders) {
        const ordDate = new Date(ord.ordered_at || ord.created_at || "").getTime();
        const isUnder15Days = !isNaN(ordDate) && (now - ordDate < HOLD_MS);
        if (isUnder15Days && !isAdminSettledNote(ord.note)) {
          const res = await recordCashbackOrder({
            orderId: ord.order_id,
            subId: ord.sub_id,
            userId: ord.user_id,
            platform: ord.platform,
            orderValue: Number(ord.order_value),
            commissionAmount: Number(ord.commission_amount),
            cashbackAmount: Number(ord.cashback_amount),
            status: "pending",
            note: "Chờ đối soát Shopee T+15 (tự động bảo toàn quỹ)",
          });
          if (res.success) revertedCount++;
        }
      }
    }
  } catch (err) {
    console.error("[autoSettleHoldPeriodOrders] error:", err);
  }

  return { settledCount, revertedCount, reconciledCount };
}
