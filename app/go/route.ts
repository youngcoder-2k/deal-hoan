import { NextRequest, NextResponse } from "next/server";
import {
  buildShopeeAffiliateUrl,
  isShopeeUrl,
  cleanShopeeUrl,
  isTikTokUrl,
  cleanTikTokUrl,
  generateAccessTradeTikTokLink,
} from "@/lib/deals/affiliate";
import { lookupFastShopeeProduct } from "@/lib/deals/providers/fast-shopee";
import { getAccessTradeToken } from "@/lib/deals/shopee-sync-config";

export const dynamic = "force-dynamic";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isAllowedRedirectUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname.toLowerCase();
    const allowed = [
      "shopee.vn",
      "shope.ee",
      "shp.ee",
      "tiktok.com",
      "lazada.vn",
      "shopeefood.vn",
      "now.vn",
      "accesstrade.vn",
    ];
    return allowed.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function renderZaloRedirectHtml(targetUrl: string): string {
  const cleanTarget = targetUrl.replace(/^https?:\/\//, "");
  const safeTargetHref = escapeHtml(targetUrl);
  const jsonTarget = JSON.stringify(targetUrl);
  const jsonCleanTarget = JSON.stringify(cleanTarget);

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Đang mở Shopee — DealHoàn</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #faf3ef; color: #17212f; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; text-align: center; }
    .card { background: white; border-radius: 20px; padding: 32px 24px; max-width: 420px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #fed7aa; }
    .logo { font-size: 24px; font-weight: 800; color: #ee4c23; margin-bottom: 12px; }
    .notice { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 14px; margin: 16px 0; font-size: 13px; color: #9a3412; line-height: 1.5; text-align: left; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #ee4c23; color: white; padding: 14px 24px; border-radius: 12px; font-weight: 700; font-size: 15px; text-decoration: none; width: 100%; box-sizing: border-box; margin-top: 8px; }
    .hint { font-size: 12px; color: #64748b; margin-top: 14px; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">DealHoàn</div>
    <h2 style="font-size: 18px; margin: 0 0 8px 0; color: #0f172a;">Đang chuyển tiếp tới Shopee</h2>
    <div class="notice">
      <b>⚠️ Bạn đang mở qua Zalo:</b><br />
      Vui lòng bấm dấu <b>[ ··· ]</b> ở góc trên bên phải màn hình → chọn <b>"Mở bằng trình duyệt"</b> (Safari / Chrome) để Shopee tự động cộng tiền hoàn.
    </div>
    <a href="${safeTargetHref}" class="btn" id="openBtn">Bấm vào đây để mở Shopee</a>
    <p class="hint">Đang tự động chuyển tiếp trong giây lát...</p>
  </div>
  <script>
    var target = ${jsonTarget};
    var isAndroid = /android/i.test(navigator.userAgent);
    if (isAndroid) {
      try {
        window.location.href = "intent://" + ${jsonCleanTarget} + "#Intent;scheme=https;package=com.android.chrome;end";
      } catch(e) {}
    }
    setTimeout(function() {
      window.location.href = target;
    }, 1500);
  </script>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const s = searchParams.get("s");
  const subId = searchParams.get("sub") || searchParams.get("sub_id") || "dealhoan";
  let targetUrl = searchParams.get("url") || searchParams.get("p");
  const userAgent = (request.headers.get("user-agent") || "").toLowerCase();
  const isZalo = /zalo/i.test(userAgent);

  // Support short Shopee format: ?s=shopId.itemId or ?s=itemId
  if (s) {
    if (s.includes(".")) {
      const [shopId, itemId] = s.split(".");
      targetUrl = `https://shopee.vn/product/${shopId}/${itemId}`;
    } else {
      targetUrl = `https://shopee.vn/product/0/${s}`;
    }
  }

  if (!targetUrl) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // 1. Shopee: Convert to official Shopee Affiliate tracking link
  if (isShopeeUrl(targetUrl)) {
    let cleanTarget = cleanShopeeUrl(targetUrl);
    // If it's a shortlink (s.shopee.vn, vn.shp.ee) without explicit /product/ or -i.
    const isDirectProduct = cleanTarget.includes("/product/") || cleanTarget.includes("-i.");
    if (!isDirectProduct) {
      try {
        const resolved = await lookupFastShopeeProduct(cleanTarget);
        if (resolved?.productLink) {
          cleanTarget = resolved.productLink;
        }
      } catch {}
    }

    const affiliateUrl = buildShopeeAffiliateUrl(cleanTarget, {
      affiliateId: "17333200656",
      subId,
    });
    if (isZalo) {
      return new NextResponse(renderZaloRedirectHtml(affiliateUrl), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }
    return NextResponse.redirect(affiliateUrl, {
      status: 307,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  // 2. TikTok Shop: Convert via AccessTrade API
  if (isTikTokUrl(targetUrl)) {
    const cleanTarget = cleanTikTokUrl(targetUrl);
    const atToken = getAccessTradeToken();
    const atResult = await generateAccessTradeTikTokLink(cleanTarget, { subId, authToken: atToken });
    const redirectUrl = atResult.success && atResult.affiliateUrl ? atResult.affiliateUrl : cleanTarget;
    return NextResponse.redirect(redirectUrl, {
      status: 307,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  // 3. Bảo vệ Open Redirect: Chỉ chuyển hướng nếu URL thuộc danh sách sàn đối tác tin cậy
  if (isAllowedRedirectUrl(targetUrl)) {
    return NextResponse.redirect(targetUrl, {
      status: 307,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  // Nếu là domain lạ hoặc không an toàn, chuyển hướng an toàn về trang chủ
  return NextResponse.redirect(new URL("/", request.url));
}
