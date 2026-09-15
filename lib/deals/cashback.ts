import { getSupabaseAdminClient } from "@/lib/auth/admin";
import { parseUserIdFromSubId } from "@/lib/deals/affiliate";

export interface CashbackOrderRecord {
  id: string;
  user_id: string;
  order_id: string;
  platform: "Shopee" | "TikTok Shop" | "Lazada";
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

// In-memory demo orders for local testing when Supabase is not connected
let demoCashbackOrders: CashbackOrderRecord[] = [
  {
    id: "co-demo-1",
    user_id: "demo-user-123",
    order_id: "240915SHP89201",
    platform: "Shopee",
    product_name: "Áo Thun Cotton Compact Cổ Tròn Thoáng Mát",
    product_image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=200&h=200&fit=crop",
    order_value: 250000,
    commission_amount: 25000,
    cashback_amount: 25000,
    cashback_rate: 100,
    status: "completed",
    sub_id: "u_demo-user-123",
    note: "Đã xác nhận đơn hàng thành công",
    ordered_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    confirmed_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
  {
    id: "co-demo-2",
    user_id: "demo-user-123",
    order_id: "240915TIK48291",
    platform: "TikTok Shop",
    product_name: "Serum B5 Phục Hồi Da La Roche-Posay 30ml",
    product_image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=200&h=200&fit=crop",
    order_value: 312000,
    commission_amount: 31000,
    cashback_amount: 31000,
    cashback_rate: 100,
    status: "pending",
    sub_id: "u_demo-user-123",
    note: "Đang giao hàng — dự kiến duyệt sau 14 ngày",
    ordered_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 1).toISOString(),
  },
];

export interface RecordCashbackOrderParams {
  orderId: string;
  subId?: string;
  userId?: string;
  platform?: "Shopee" | "TikTok Shop" | "Lazada";
  productName?: string;
  productImage?: string;
  orderValue: number;
  commissionAmount?: number;
  cashbackAmount?: number;
  status?: "pending" | "completed" | "rejected";
  note?: string;
  orderedAt?: string;
}

/**
 * Tra cứu userId thực tế từ subId hoặc prefix subId
 */
export async function resolveUserIdFromSubId(
  subId?: string | null,
  providedUserId?: string | null
): Promise<string | null> {
  if (providedUserId && providedUserId.trim()) {
    return providedUserId.trim();
  }
  if (!subId) return null;

  const parsed = parseUserIdFromSubId(subId);
  if (!parsed) return null;

  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return parsed;
  }

  // Nếu parsed là UUID đầy đủ (36 ký tự)
  if (parsed.length === 36 && parsed.includes("-")) {
    return parsed;
  }

  // Nếu là prefix (ví dụ 8 ký tự u_1f162a51), tra cứu trong auth.users
  try {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 100,
    });
    if (users?.users?.length) {
      const matched = users.users.find((u) => u.id.startsWith(parsed));
      if (matched) return matched.id;
    }
  } catch (err) {
    console.warn("Error resolving user by prefix:", err);
  }

  return parsed;
}

/**
 * Ghi nhận hoặc cập nhật một đơn hàng hoàn tiền vào hệ thống
 * Đồng thời tự động cập nhật số dư ví kép (user_wallets + user_metadata)
 */
export async function recordCashbackOrder(params: RecordCashbackOrderParams): Promise<{
  success: boolean;
  order?: CashbackOrderRecord;
  error?: string;
}> {
  const {
    orderId,
    subId,
    userId: rawUserId,
    platform = "Shopee",
    productName = "Sản phẩm mua qua DealHoàn",
    productImage = "",
    orderValue = 0,
    commissionAmount,
    cashbackAmount: explicitCashback,
    status = "pending",
    note = "",
    orderedAt,
  } = params;

  if (!orderId || !orderId.trim()) {
    return { success: false, error: "Mã đơn hàng (orderId) không được để trống." };
  }

  const cleanOrderId = orderId.trim();
  const cleanPlatform = platform;

  // 1. Xác định User ID
  const resolvedUserId = await resolveUserIdFromSubId(subId, rawUserId);
  if (!resolvedUserId) {
    return {
      success: false,
      error: `Không tìm thấy tài khoản người dùng tương ứng với subId: ${subId || "trống"}.`,
    };
  }

  // 2. Tính toán tiền hoa hồng và tiền hoàn
  const calculatedCommission =
    typeof commissionAmount === "number" && commissionAmount >= 0
      ? commissionAmount
      : Math.round(orderValue * (cleanPlatform === "Shopee" ? 0.08 : 0.05));

  const calculatedCashback =
    typeof explicitCashback === "number" && explicitCashback >= 0
      ? explicitCashback
      : calculatedCommission; // DealHoàn mặc định hoàn 100% hoa hồng sàn trả

  const supabaseAdmin = getSupabaseAdminClient();

  // 3. Xử lý demo nếu không có Supabase
  if (!supabaseAdmin) {
    const existingIndex = demoCashbackOrders.findIndex(
      (o) => o.order_id === cleanOrderId && o.platform === cleanPlatform
    );

    const now = new Date().toISOString();
    let orderRecord: CashbackOrderRecord;

    if (existingIndex >= 0) {
      orderRecord = {
        ...demoCashbackOrders[existingIndex],
        status,
        note: note || demoCashbackOrders[existingIndex].note,
        updated_at: now,
        confirmed_at: status === "completed" ? now : demoCashbackOrders[existingIndex].confirmed_at,
      };
      demoCashbackOrders[existingIndex] = orderRecord;
    } else {
      orderRecord = {
        id: `co-${Date.now()}`,
        user_id: resolvedUserId,
        order_id: cleanOrderId,
        platform: cleanPlatform,
        product_name: productName,
        product_image: productImage,
        order_value: orderValue,
        commission_amount: calculatedCommission,
        cashback_amount: calculatedCashback,
        cashback_rate: 100,
        status,
        sub_id: subId || `u_${resolvedUserId}`,
        note,
        ordered_at: orderedAt || now,
        confirmed_at: status === "completed" ? now : null,
        created_at: now,
        updated_at: now,
      };
      demoCashbackOrders.unshift(orderRecord);
    }

    return { success: true, order: orderRecord };
  }

  // 4. Lưu vào cơ sở dữ liệu Supabase
  try {
    // Kiểm tra đơn hàng đã tồn tại chưa
    const { data: existingOrder } = await supabaseAdmin
      .from("cashback_orders")
      .select("*")
      .eq("order_id", cleanOrderId)
      .eq("platform", cleanPlatform)
      .maybeSingle();

    const oldStatus = existingOrder?.status as "pending" | "completed" | "rejected" | undefined;
    const oldCashback = Number(existingOrder?.cashback_amount || 0);

    const now = new Date().toISOString();
    const orderData = {
      user_id: resolvedUserId,
      order_id: cleanOrderId,
      platform: cleanPlatform,
      product_name: productName || existingOrder?.product_name || "Sản phẩm mua qua DealHoàn",
      product_image: productImage || existingOrder?.product_image || "",
      order_value: orderValue || existingOrder?.order_value || 0,
      commission_amount: calculatedCommission,
      cashback_amount: calculatedCashback,
      cashback_rate: 100,
      status,
      sub_id: subId || existingOrder?.sub_id || `u_${resolvedUserId}`,
      note: note || existingOrder?.note || "",
      ordered_at: orderedAt || existingOrder?.ordered_at || now,
      confirmed_at: status === "completed" ? (existingOrder?.confirmed_at || now) : null,
      updated_at: now,
    };

    let savedOrder: CashbackOrderRecord;

    if (existingOrder) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("cashback_orders")
        .update(orderData)
        .eq("id", existingOrder.id)
        .select("*")
        .single();

      if (updateError) {
        throw new Error(`Lỗi cập nhật đơn hàng: ${updateError.message}`);
      }
      savedOrder = updated;
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("cashback_orders")
        .insert({
          ...orderData,
          created_at: now,
        })
        .select("*")
        .single();

      if (insertError) {
        throw new Error(`Lỗi tạo đơn hàng mới: ${insertError.message}`);
      }
      savedOrder = inserted;
    }

    // 5. Cập nhật số dư ví người dùng theo trạng thái
    await applyCashbackToUserWallet(
      supabaseAdmin,
      resolvedUserId,
      status,
      calculatedCashback,
      oldStatus,
      oldCashback
    );

    return { success: true, order: savedOrder };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal database error";
    console.error("recordCashbackOrder error:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Điều chỉnh số dư kép (user_wallets + user_metadata) theo thay đổi trạng thái đơn
 */
async function applyCashbackToUserWallet(
  supabaseAdmin: any,
  userId: string,
  newStatus: "pending" | "completed" | "rejected",
  newCashback: number,
  oldStatus?: "pending" | "completed" | "rejected",
  oldCashback: number = 0
) {
  try {
    // 1. Lấy thông tin ví hiện tại
    const { data: wallet } = await supabaseAdmin
      .from("user_wallets")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    let balance = Number(wallet?.balance || 0);
    let pendingBalance = Number(wallet?.pending_balance || 0);

    // 2. Hoàn nguyên trạng thái cũ nếu có
    if (oldStatus) {
      if (oldStatus === "pending") {
        pendingBalance = Math.max(0, pendingBalance - oldCashback);
      } else if (oldStatus === "completed") {
        balance = Math.max(0, balance - oldCashback);
      }
    }

    // 3. Áp dụng trạng thái mới
    if (newStatus === "pending") {
      pendingBalance += newCashback;
    } else if (newStatus === "completed") {
      balance += newCashback;
    }

    // 4. Lưu lại vào user_wallets
    await supabaseAdmin.from("user_wallets").upsert(
      {
        user_id: userId,
        balance,
        pending_balance: pendingBalance,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    // 5. Đồng thời lưu trực tiếp vào auth.users.raw_user_meta_data
    if (supabaseAdmin.auth?.admin) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userData?.user) {
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...(userData.user.user_metadata || {}),
            balance,
            pending_balance: pendingBalance,
          },
        });
      }
    }
  } catch (err) {
    console.warn("applyCashbackToUserWallet warning:", err);
  }
}

/**
 * Lấy danh sách đơn hàng hoàn tiền của một người dùng
 */
export async function getUserCashbackOrders(userId: string): Promise<CashbackOrderRecord[]> {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseAdmin) {
    return demoCashbackOrders.filter((o) => o.user_id === userId || userId === "demo-user-123");
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("cashback_orders")
      .select("*")
      .eq("user_id", userId)
      .order("ordered_at", { ascending: false });

    if (error) {
      console.warn("getUserCashbackOrders query fallback:", error.message);
      return demoCashbackOrders.filter((o) => o.user_id === userId);
    }

    return data || [];
  } catch {
    return [];
  }
}
