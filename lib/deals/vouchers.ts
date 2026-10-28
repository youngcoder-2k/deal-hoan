import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { hasSupabaseConfig, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { createClient } from "@supabase/supabase-js";
import type { Coupon } from "./types";
import { getDailyShopeeCoupons } from "./coupons-static";

const VOUCHER_CACHE_DIR = path.join(process.cwd(), "lib/deals/cache");
const VOUCHER_CACHE_PATH = path.join(VOUCHER_CACHE_DIR, "shopee-vouchers.json");

// Tự động làm mới cache nếu cũ hơn 15 phút
const VOUCHER_TTL_MS = 15 * 60 * 1000;
const DEALHOAN_AFFILIATE_ID = "17333200656";

let inFlightSync: Promise<Coupon[]> | null = null;

async function readFromSupabase(): Promise<Coupon[] | null> {
  if (!hasSupabaseConfig || !supabaseUrl || !supabasePublishableKey) return null;
  try {
    const sb = createClient(supabaseUrl, supabasePublishableKey);
    const { data, error } = await sb.from("flash_sale_cache").select("data").eq("id", "latest").single();
    if (error || !data) return null;
    if (Array.isArray(data.data?.vouchers) && data.data.vouchers.length > 0) {
      return data.data.vouchers as Coupon[];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Tự động cào mã giảm giá thật đang chạy trên hệ thống Shopee
 */
export async function fetchLiveShopeeVouchers(): Promise<Coupon[]> {
  const endpoint = "https://riokupon.com/api/vn/voucher/data/voucher-list-today_list.txt?v=" + Date.now();
  const res = await fetch(endpoint, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} khi tải danh sách voucher Shopee`);
  }

  const html = await res.text();
  const items = html.match(/<li[^>]*class="bc_voucher_item"[^>]*>[\s\S]*?<\/li>/g) || [];
  if (items.length === 0) return [];

  const parsed: Coupon[] = [];
  const seenCodes = new Set<string>();

  for (const item of items) {
    const codeMatch = item.match(/data-code=["']([A-Z0-9]+)["']/i);
    if (!codeMatch) continue;
    const code = codeMatch[1].trim();
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);

    const labelMatch = item.match(/class="bc_voucher_label"[^>]*>([\s\S]*?)<\/span>/i);
    const label = labelMatch ? labelMatch[1].replace(/<[^>]+>/g, "").trim() : "Giảm giá";

    const titleMatch = item.match(/class="bc_voucher_title"[^>]*>[\s\S]*?<\/span>([\s\S]*?)<\/div>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : label;

    const descMatch = item.match(/title=["']([^"']*Chỉ áp dụng[^"']*)["']/i) || item.match(/title=["']([^"']*HSD[^"']*)["']/i);
    const desc = descMatch ? descMatch[1].trim() : title;

    const useMatch = item.match(/width:\s*(\d+)%/i);
    const usagePercent = useMatch ? parseInt(useMatch[1], 10) : 50;

    let targetUrl = "https://shopee.vn";
    const urlMatch = item.match(/href=["'][^"']*url=([^"&']+)/i);
    if (urlMatch) {
      targetUrl = decodeURIComponent(urlMatch[1]);
    }

    // Bọc link affiliate của DealHoàn
    const trackedUrl = `https://s.shopee.vn/an_redir?affiliate_id=${DEALHOAN_AFFILIATE_ID}&url=${encodeURIComponent(targetUrl)}`;

    const amtMatch = title.match(/(\d+%(?:\s+tối\s+đa\s+\d+k)?|\d+k)/i) || desc.match(/giảm\s+(\d+%(?:\s+tối\s+đa\s+\d+k)?|\d+k)/i);
    const amount = amtMatch ? amtMatch[1].toUpperCase() : "HOT";

    const condMatch = title.match(/(Đơn\s+tối\s+thiểu\s+[^·\n]+)/i) || desc.match(/(đơn\s+hàng\s+hợp\s+lệ\s+từ\s+[^·\n]+)/i);
    const condition = condMatch ? condMatch[1].trim() : "Đơn từ 0đ";

    const isMall = label.toLowerCase().includes("mall") || desc.toLowerCase().includes("shopee mall");
    const isFreeship = label.toLowerCase().includes("freeship") || title.toLowerCase().includes("vận chuyển");

    parsed.push({
      id: `shopee-live-${code.toLowerCase()}`,
      code,
      amount,
      unit: "giảm",
      title: `${label}: ${title}`,
      subtitle: desc.slice(0, 80),
      condition,
      color: isMall ? "orange" : isFreeship ? "green" : "red",
      category: isMall ? "mall" : isFreeship ? "freeship" : "toan_san",
      platform: isMall ? "Shopee Mall" : "Shopee",
      url: trackedUrl,
      badge: label.toUpperCase(),
      usagePercent,
    });
  }

  return parsed;
}

/**
 * Tự động đồng bộ và lưu vào cache
 */
async function autoSyncAndCache(): Promise<Coupon[]> {
  try {
    const live = await fetchLiveShopeeVouchers();
    if (live.length > 0) {
      if (!existsSync(VOUCHER_CACHE_DIR)) {
        await mkdir(VOUCHER_CACHE_DIR, { recursive: true });
      }
      await writeFile(VOUCHER_CACHE_PATH, JSON.stringify(live, null, 2), "utf-8");
      console.log(`[DealHoàn AutoSync] Đã tự động cập nhật ${live.length} mã Shopee thật vào cache!`);
      return live;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[DealHoàn AutoSync] Không thể làm mới voucher ngầm:", msg);
  }
  return [];
}

/**
 * Lấy danh sách voucher Shopee với cơ chế TỰ ĐỘNG HOÀN TOÀN (Stale-While-Revalidate):
 * 1. Nếu chưa có mã hoặc cache rỗng: Tự động tải mã thật ngay (không cần gõ lệnh CLI).
 * 2. Nếu đã có cache nhưng quá 15 phút: Trả cache ngay (0ms) và tự động làm mới ngầm ở background.
 * 3. Người dùng và lập trình viên KHÔNG CẦN CHẠY BẤT KỲ LỆNH THỦ CÔNG NÀO.
 */
export async function getVouchers(): Promise<Coupon[]> {
  let cachedVouchers: Coupon[] = [];
  let isCacheStale = true;

  // 1. Kiểm tra cache Supabase Cloud
  try {
    const cloud = await readFromSupabase();
    if (cloud && cloud.length > 0) {
      return cloud;
    }
  } catch {}

  // 2. Kiểm tra file cache cục bộ
  try {
    if (existsSync(VOUCHER_CACHE_PATH)) {
      const stats = await stat(VOUCHER_CACHE_PATH);
      const age = Date.now() - stats.mtimeMs;
      if (age < VOUCHER_TTL_MS) {
        isCacheStale = false;
      }
      const raw = await readFile(VOUCHER_CACHE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedVouchers = parsed;
      }
    }
  } catch {}

  // 3. Tự động kích hoạt sync nếu chưa có dữ liệu hoặc dữ liệu đã cũ
  if (cachedVouchers.length === 0) {
    // Chưa có mã nào -> Tự động kéo ngay lập tức
    if (!inFlightSync) {
      inFlightSync = autoSyncAndCache().finally(() => { inFlightSync = null; });
    }
    const fresh = await inFlightSync;
    if (fresh.length > 0) return fresh;
  } else if (isCacheStale) {
    // Đã có mã nhưng cũ hơn 15 phút -> Trả mã cũ ngay và tự cập nhật ngầm ở background
    if (!inFlightSync) {
      inFlightSync = autoSyncAndCache().finally(() => { inFlightSync = null; });
    }
  }

  // 4. Trả về danh sách mã thật đã cache
  if (cachedVouchers.length > 0) {
    return cachedVouchers;
  }

  // 5. Fallback cuối cùng
  return getDailyShopeeCoupons();
}
