import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getShopeeSyncConfig, type ShopeeSyncConfig } from "./shopee-sync-config";

/** Unlike a Vercel function's local JSON, this survives restarts and redeployments. */
export async function loadOrderSyncConfig(): Promise<ShopeeSyncConfig> {
  const defaults = getShopeeSyncConfig();
  const db = getSupabaseServiceClient();
  if (!db) return defaults;
  const { data, error } = await db.from("shopee_sync_settings").select("settings").eq("id","current").maybeSingle();
  if (error) throw new Error("Chưa đọc được cấu hình đồng bộ đơn. Kiểm tra migration cơ sở dữ liệu.");
  return { ...defaults, ...(data?.settings || {}) };
}
export async function saveOrderSyncConfig(update: Partial<ShopeeSyncConfig>): Promise<ShopeeSyncConfig> {
  const db = getSupabaseServiceClient();
  if (!db) throw new Error("Chưa cấu hình kết nối lưu thiết lập đồng bộ.");
  const current = await loadOrderSyncConfig();
  const settings = { ...current, ...update, updatedAt: new Date().toISOString() };
  const { error } = await db.from("shopee_sync_settings").upsert({ id:"current",settings,updated_at:settings.updatedAt });
  if (error) throw new Error("Chưa lưu được cấu hình đồng bộ.");
  return settings;
}
export function publicOrderSyncConfig(config: ShopeeSyncConfig) {
  const { shopeeCookie, accesstradeToken, shopeeAppId, shopeeSecret, ...visible } = config;
  return { ...visible, hasCookie:Boolean(shopeeCookie || process.env.SHOPEE_STORAGE_STATE),
    hasAccessTradeToken:Boolean(accesstradeToken || process.env.ACCESSTRADE_TOKEN),
    hasShopeeOpenApi:Boolean(shopeeAppId && shopeeSecret),
    shopeeCookieMasked: shopeeCookie ? "Đã lưu phiên Shopee" : "",
    accesstradeTokenMasked: accesstradeToken ? "Đã lưu AccessTrade" : "",
    shopeeAppIdMasked: shopeeAppId ? "Đã lưu App ID" : "" };
}
