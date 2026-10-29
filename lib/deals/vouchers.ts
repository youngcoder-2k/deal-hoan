import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Coupon } from "./types";
import { getDailyShopeeCoupons } from "./coupons-static";

const VOUCHER_CACHE_DIR = path.join(process.cwd(), "lib/deals/cache");
const VOUCHER_CACHE_PATH = path.join(VOUCHER_CACHE_DIR, "shopee-vouchers.json");

// Ngụy trang User-Agent trình duyệt thật để luân phiên
const STEALTH_USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
];

function getStealthHeaders(): Record<string, string> {
  const ua = STEALTH_USER_AGENTS[Math.floor(Math.random() * STEALTH_USER_AGENTS.length)];
  return {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://riokupon.com/vn/",
    "Origin": "https://riokupon.com",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
  };
}

// TTL cơ bản 15 phút + Jitter ngẫu nhiên 3 - 8 phút để tránh chu kỳ quét cố định bị bot-detector phát hiện
function getDynamicTTL(): number {
  const baseMs = 15 * 60 * 1000;
  const jitterMs = Math.floor(Math.random() * 8 * 60 * 1000);
  return baseMs + jitterMs;
}

/**
 * Kiểm tra xem từ lần đồng bộ cuối đến nay đã bước qua khung giờ vàng mới của Shopee chưa:
 * Các khung giờ vàng Shopee tung mã và mở lại lượt dùng: 0h, 9h, 12h, 18h, 21h (GMT+7).
 */
export function hasEnteredNewShopeeSlot(lastSyncedMs: number): boolean {
  if (!lastSyncedMs || lastSyncedMs <= 0) return true;

  const vnNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const vnLast = new Date(new Date(lastSyncedMs).toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));

  // Nếu đã sang ngày khác -> Chắc chắn đã bước qua khung giờ 0h của ngày mới
  if (vnNow.toDateString() !== vnLast.toDateString()) {
    return true;
  }

  const currentHour = vnNow.getHours();
  const lastHour = vnLast.getHours();
  const SHOPEE_SLOTS = [0, 9, 12, 18, 21];

  // Khung giờ vàng gần nhất trong ngày hiện tại
  const latestSlot = [...SHOPEE_SLOTS].reverse().find((slot) => currentHour >= slot) ?? 0;

  // Nếu lần đồng bộ trước diễn ra trước khung giờ vàng này -> Phải đồng bộ ngay gói mã mới
  return lastHour < latestSlot;
}

const DEALHOAN_AFFILIATE_ID = "17333200656";

let inFlightSync: Promise<Coupon[]> | null = null;

/**
 * Tự động cào mã giảm giá thật đang chạy trong thời gian thực trên hệ thống Shopee
 */
export async function fetchLiveShopeeVouchers(): Promise<Coupon[]> {
  const endpoints = [
    "https://api.riokupon.com/vn/htm/home.php?store_merchant=shopee&voucher_main=all&type=&layout=voucher-list&limit=150",
    "https://api.riokupon.com/vn/htm/home.php?store_merchant=shopee&voucher_main=freeship&type=&layout=voucher-list&limit=50",
  ];

  const results = await Promise.allSettled(
    endpoints.map((url) =>
      fetch(url, {
        headers: getStealthHeaders(),
        signal: AbortSignal.timeout(12000),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
    )
  );

  const parsed: Coupon[] = [];
  const seenCodes = new Set<string>();

  for (const res of results) {
    if (res.status !== "fulfilled") continue;
    const html = res.value;
    const items = html.match(/<li[^>]*class="bc_voucher_item"[^>]*>[\s\S]*?<\/li>/g) || [];

    for (const item of items) {
      const codeMatch = item.match(/data-code=["']([A-Z0-9\-_]+)["']/i);
      if (!codeMatch) continue;
      const code = codeMatch[1].trim();
      if (seenCodes.has(code)) continue;
      seenCodes.add(code);

      const labelMatch = item.match(/class="bc_voucher_label"[^>]*>([\s\S]*?)<\/span>/i);
      const label = labelMatch ? labelMatch[1].replace(/<[^>]+>/g, "").trim() : "Giảm giá";

      const titleMatch = item.match(/class="bc_voucher_title"[^>]*>[\s\S]*?<\/span>([\s\S]*?)<\/div>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : label;

      const descMatch =
        item.match(/class="bc_voucher_desc_item[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
        item.match(/title=["']([^"']*Chỉ áp dụng[^"']*)["']/i) ||
        item.match(/title=["']([^"']*HSD[^"']*)["']/i);
      const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : title;

      const useMatch = item.match(/width:\s*(\d+)%/i);
      const usagePercent = useMatch ? parseInt(useMatch[1], 10) : 50;

      let targetUrl = "https://shopee.vn";
      const urlMatch = item.match(/href=["'][^"']*url=([^"'&]+)/i);
      if (urlMatch) {
        targetUrl = decodeURIComponent(urlMatch[1]);
      }

      // Bọc link affiliate của DealHoàn
      const trackedUrl = `https://s.shopee.vn/an_redir?affiliate_id=${DEALHOAN_AFFILIATE_ID}&url=${encodeURIComponent(targetUrl)}`;

      const amtMatch =
        title.match(/(\d+%(?:\s+tối\s+đa\s+\d+k)?|\d+k|\d+,\d+đ|\d+đ)/i) ||
        desc.match(/giảm\s+(\d+%(?:\s+tối\s+đa\s+\d+k)?|\d+k|\d+,\d+đ|\d+đ)/i);
      const amount = amtMatch ? amtMatch[1].toUpperCase() : "HOT";

      const condMatch =
        title.match(/(Đơn\s+tối\s+thiểu\s+[^·\n\+]+)/i) ||
        desc.match(/(đơn\s+hàng\s+hợp\s+lệ\s+từ\s+[^·\n\+]+)/i) ||
        title.match(/(hợp\s+lệ\s+từ\s+[^·\n\+]+)/i);
      const condition = condMatch ? condMatch[1].trim() : "Đơn từ 0đ";

      const isMall = label.toLowerCase().includes("mall") || desc.toLowerCase().includes("shopee mall");
      const isFreeship =
        label.toLowerCase().includes("freeship") ||
        title.toLowerCase().includes("vận chuyển") ||
        label.toLowerCase().includes("vận chuyển") ||
        item.includes("Mã vận chuyển");

      parsed.push({
        id: `shopee-live-${code.toLowerCase()}`,
        code,
        amount,
        unit: isFreeship ? "ship" : "giảm",
        title: `${label}: ${title.slice(0, 75)}`,
        subtitle: desc.slice(0, 80),
        condition,
        color: isMall ? "orange" : isFreeship ? "green" : "red",
        category: isMall ? "mall" : isFreeship ? "freeship" : "toan_san",
        platform: isMall ? "Shopee Mall" : "Shopee",
        url: trackedUrl,
        badge: isFreeship ? "FREESHIP" : isMall ? "SHOPEE MALL" : label.toUpperCase(),
        usagePercent,
      });
    }
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

  // 1. Kiểm tra file cache cục bộ
  try {
    if (existsSync(VOUCHER_CACHE_PATH)) {
      const stats = await stat(VOUCHER_CACHE_PATH);
      const age = Date.now() - stats.mtimeMs;
      const isNewSlot = hasEnteredNewShopeeSlot(stats.mtimeMs);

      // Nếu chưa hết hạn TTL VÀ chưa bước qua khung giờ vàng mới của Shopee
      if (age < getDynamicTTL() && !isNewSlot) {
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
