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

export function getShoppingSessions(): ShoppingSession[] {
  return [];
}

export function saveShoppingSession(): void {
  // Không lưu phiên mua tạm thời làm đơn hàng.
  // Đơn hàng chỉ hiển thị khi Shopee chính thức xác nhận và ghi nhận qua webhook/sync.
}

export function mergeOrdersWithSessions<T>(orders: T[]): T[] {
  return orders || [];
}
