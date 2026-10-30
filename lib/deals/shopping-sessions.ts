export interface ShoppingSession {
  id: string;
  user_id?: string;
  order_id: string;
  platform: "Shopee" | "ShopeeFood" | "TikTok Shop" | "Lazada";
  product_name: string;
  product_image?: string | null;
  order_value: number;
  cashback_amount: number;
  status: "tracking" | "pending" | "completed" | "rejected";
  note?: string | null;
  ordered_at: string;
  is_tracking_session?: boolean;
}

const STORAGE_KEY = "dealhoan_shopping_sessions";
const MAX_SESSIONS = 15;
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 giờ

export function getShoppingSessions(userId?: string): ShoppingSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: ShoppingSession[] = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    const now = Date.now();
    // Lọc các session chưa quá 48h
    const valid = list.filter((s) => {
      const age = now - new Date(s.ordered_at).getTime();
      if (age > MAX_AGE_MS) return false;
      if (userId && s.user_id && s.user_id !== userId) return false;
      return true;
    });

    return valid;
  } catch {
    return [];
  }
}

export function saveShoppingSession(
  session: Omit<ShoppingSession, "id" | "ordered_at" | "status" | "order_id"> & {
    id?: string;
    ordered_at?: string;
    order_id?: string;
    status?: ShoppingSession["status"];
  }
): ShoppingSession {
  const newSession: ShoppingSession = {
    id: session.id || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    user_id: session.user_id,
    order_id: session.order_id || "ĐANG-CHỜ-SÀN",
    platform: session.platform || "Shopee",
    product_name: session.product_name || "Sản phẩm mua qua DealHoàn",
    product_image: session.product_image || null,
    order_value: Number(session.order_value) || 0,
    cashback_amount: Number(session.cashback_amount) || 0,
    status: session.status || "tracking",
    note:
      session.note ||
      `Đã chuyển sang ${session.platform || "Shopee"} · Sàn đang đối soát và sẽ gửi đơn trong 15–45 phút.`,
    ordered_at: session.ordered_at || new Date().toISOString(),
    is_tracking_session: true,
  };

  if (typeof window === "undefined") return newSession;

  try {
    const existing = getShoppingSessions(session.user_id);
    // Tránh trùng lặp nếu vừa bấm cùng sản phẩm trong vòng 3 phút
    const deduped = existing.filter(
      (s) =>
        !(
          s.product_name === newSession.product_name &&
          Math.abs(Date.now() - new Date(s.ordered_at).getTime()) < 3 * 60 * 1000
        )
    );

    const updated = [newSession, ...deduped].slice(0, MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}

  return newSession;
}

export function removeShoppingSession(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = getShoppingSessions();
    const updated = list.filter((s) => s.id !== sessionId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

/**
 * Hòa trộn danh sách đơn hàng thực tế từ server với các phiên mua sắm vừa bấm
 */
export function mergeOrdersWithSessions<T extends { id: string; order_id: string; platform: string; ordered_at: string }>(
  serverOrders: T[],
  sessions: ShoppingSession[]
): (T | ShoppingSession)[] {
  if (!sessions || sessions.length === 0) return serverOrders;
  if (!serverOrders || serverOrders.length === 0) return sessions;

  // Lọc bỏ những session đã có đơn hàng thực tế tương ứng từ sàn
  const unmatchedSessions = sessions.filter((sess) => {
    const sessTime = new Date(sess.ordered_at).getTime();
    const hasMatch = serverOrders.some((ord) => {
      if (ord.platform !== sess.platform) return false;
      const ordTime = new Date(ord.ordered_at).getTime();
      // Nếu thời gian chênh lệch dưới 2 giờ giữa click và order, xem như đã có đơn thật
      return Math.abs(ordTime - sessTime) < 2 * 60 * 60 * 1000;
    });
    return !hasMatch;
  });

  const combined = [...unmatchedSessions, ...serverOrders];
  // Sắp xếp đơn mới nhất lên đầu
  combined.sort((a, b) => new Date(b.ordered_at).getTime() - new Date(a.ordered_at).getTime());
  return combined;
}
