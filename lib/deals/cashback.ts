import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { parseUserIdFromSubId } from "@/lib/deals/affiliate";
import { getBoosterSettingsSync } from "@/lib/deals/cashback-booster";

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
  const limit = params.commissionAmount === undefined ? undefined : Math.round(params.commissionAmount * (100 - margin) / 100);
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
