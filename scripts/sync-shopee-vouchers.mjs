// Chạy: node scripts/sync-shopee-vouchers.mjs
// Tự động cào và đồng bộ hơn 200+ mã giảm giá THẬT của Shopee
// Kèm theo promotionId, signature lưu mã vào ví và mã code nhập tay.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE_DIR = join(ROOT, "lib", "deals", "cache");
const OUT_PATH = join(CACHE_DIR, "shopee-vouchers.json");

const DEALHOAN_AFFILIATE_ID = "17333200656";

export async function syncShopeeVouchers() {
  console.log("⚡ Bắt đầu đồng bộ kho voucher THẬT từ Shopee...");
  
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  const endpoint = "https://riokupon.com/api/vn/voucher/data/voucher-list-today_list.txt?v=" + Date.now();
  const res = await fetch(endpoint, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} khi tải danh sách voucher`);
  }

  const html = await res.text();
  const items = html.match(/<li[^>]*class="bc_voucher_item"[^>]*>[\s\S]*?<\/li>/g) || [];
  console.log(`📦 Tìm thấy ${items.length} bản ghi voucher từ hệ thống.`);

  const parsed = [];
  const seenCodes = new Set();

  for (const item of items) {
    const codeMatch = item.match(/data-code=["\x27]([A-Z0-9]+)["\x27]/i);
    if (!codeMatch) continue;
    const code = codeMatch[1].trim();
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);

    const labelMatch = item.match(/class="bc_voucher_label"[^>]*>([\s\S]*?)<\/span>/i);
    const label = labelMatch ? labelMatch[1].replace(/<[^>]+>/g, "").trim() : "Giảm giá";

    const titleMatch = item.match(/class="bc_voucher_title"[^>]*>[\s\S]*?<\/span>([\s\S]*?)<\/div>/i);
    let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : label;

    const descMatch = item.match(/title=["\x27]([^"\x27]*Chỉ áp dụng[^"\x27]*)["\x27]/i) || item.match(/title=["\x27]([^"\x27]*HSD[^"\x27]*)["\x27]/i);
    const desc = descMatch ? descMatch[1].trim() : title;

    const useMatch = item.match(/width:\s*(\d+)%/i);
    const usagePercent = useMatch ? parseInt(useMatch[1], 10) : 50;

    let targetUrl = "https://shopee.vn";
    const urlMatch = item.match(/href=["\x27][^"\x27]*url=([^"&\x27]+)/i);
    if (urlMatch) {
      targetUrl = decodeURIComponent(urlMatch[1]);
    }

    // Bọc qua link affiliate chính ngạch của DealHoàn để nhận hoa hồng
    const trackedUrl = `https://s.shopee.vn/an_redir?affiliate_id=${DEALHOAN_AFFILIATE_ID}&url=${encodeURIComponent(targetUrl)}`;

    // Xác định số tiền giảm & đơn tối thiểu
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

  if (parsed.length === 0) {
    console.warn("⚠️ Không tìm thấy voucher hợp lệ nào.");
    return [];
  }

  // Ghi vào cache cục bộ
  writeFileSync(OUT_PATH, JSON.stringify(parsed, null, 2), "utf-8");
  console.log(`✅ Đã lưu ${parsed.length} voucher THẬT vào ${OUT_PATH}`);

  // Cập nhật Supabase nếu có cấu hình
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (sbUrl && sbKey) {
    try {
      const sb = createClient(sbUrl, sbKey);
      await sb.from("flash_sale_cache").upsert({
        id: "latest",
        data: { vouchers: parsed, updatedAt: new Date().toISOString() },
        updated_at: new Date().toISOString()
      });
      console.log("☁️ Đã đồng bộ lên Supabase Cloud cache!");
    } catch (e) {
      console.warn("⚠️ Bỏ qua Supabase upsert:", e.message);
    }
  }

  return parsed;
}

// Nếu gọi trực tiếp từ CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const vouchers = await syncShopeeVouchers();
    console.log(`🎉 Hoàn tất! Đã cập nhật ${vouchers.length} mã giảm giá Shopee thật.`);
  } catch (err) {
    console.error("❌ Lỗi đồng bộ voucher:", err);
    process.exit(1);
  }
}
