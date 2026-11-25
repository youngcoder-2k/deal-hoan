import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseJsonBody, handleApiError } from "@/lib/api/response";
import { NextRequest, NextResponse } from "next/server";
import {
  buildShopeeAffiliateUrl,
  buildShopeeFoodAffiliateUrl,
  cleanShopeeUrl,
  isShopeeUrl,
  isShopeeFoodUrl,
  isLazadaUrl,
  isShopeeShortlinkUrl,
  isShopeeErrorOrGateUrl,
  resolveShopeeShortlink,
  isTikTokUrl,
  cleanTikTokUrl,
  generateAccessTradeTikTokLink,
  buildCustomShortUrl,
  extractUrlFromText,
  formatSubIdForUser,
} from "@/lib/deals/affiliate";
import { resolveLazadaProduct } from "@/lib/deals/lazada-affiliate";
import { resolveRioHubTikTokProduct } from "@/lib/deals/riohub-affiliate";
import { cashbackFor } from "@/lib/deals/score";
import type { Platform } from "@/lib/deals/types";
import { resolveProductLocally, type CalculatedProduct } from "@/lib/deals/resolve";
import { lookupAccessTradeProduct } from "@/lib/deals/providers/accesstrade";
import { lookupHoanNgayProduct, getShopeeCategoryRate } from "@/lib/deals/providers/hoanngay";
import { boostCashbackRate, getBoosterSettings } from "@/lib/deals/cashback-booster";
import { getAccessTradeToken } from "@/lib/deals/shopee-sync-config";
import { getVouchers } from "@/lib/deals/vouchers";
import { matchVouchersForProduct, type MatchedCoupon } from "@/lib/deals/matching";

export const dynamic = "force-dynamic";

function extractMeta(html: string, propertyOrName: string): string | null {
  const p = propertyOrName.replace(/:/g, "\\:");
  // Match property="..." content="..."
  const r1 = new RegExp(`<meta[^>]+property=["']${p}["'][^>]+content=["']([^"']+)["']`, "i");
  // Match content="..." property="..."
  const r2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${p}["']`, "i");
  // Match name="..." content="..."
  const r3 = new RegExp(`<meta[^>]+name=["']${p}["'][^>]+content=["']([^"']+)["']`, "i");
  // Match content="..." name="..."
  const r4 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${p}["']`, "i");

  const m = html.match(r1) || html.match(r2) || html.match(r3) || html.match(r4);
  return m ? m[1].trim() : null;
}

function extractShopeeBreadcrumbCategory(html: string): string | null {
  try {
    const allLd = [...html.matchAll(/<script data-rh="true" type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    for (const match of allLd) {
      if (match[1].includes("BreadcrumbList")) {
        const parsed = JSON.parse(match[1]);
        const items = parsed?.itemListElement;
        if (Array.isArray(items) && items.length >= 2) {
          const topCat = items[1]?.item?.name;
          if (topCat) return String(topCat).trim();
        }
      }
    }
  } catch {}
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await parseJsonBody<Record<string, unknown>>(request)) || {};
    const rawInput = body.url ? String(body.url).trim() : "";
    let rawUrl = extractUrlFromText(rawInput);
    if (rawUrl && !rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
      rawUrl = `https://${rawUrl}`;
    }
    let inputUrl: URL;
    try {
      inputUrl = new URL(rawUrl);
      if (!["https:", "http:"].includes(inputUrl.protocol)) throw new Error("invalid_protocol");
    } catch {
      return NextResponse.json({ error: "invalid_url", message: "Link chưa hợp lệ. Hãy sao chép liên kết sản phẩm rồi dán lại." }, { status: 400 });
    }
    const host = inputUrl.hostname.toLowerCase();
    const allowedDomains = [
      "shopee.vn",
      "shopeefood.vn",
      "shopeefood.com.vn",
      "now.vn",
      "shope.ee",
      "shp.ee",
      "lazada.vn",
      "lzd.co",
      "tiktok.com",
      "tiktokv.com",
    ];
    const allowedHost = allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
    if (!allowedHost) {
      return NextResponse.json({ error: "unsupported_platform", message: "Hãy dán link sản phẩm Shopee, ShopeeFood, Lazada hoặc TikTok Shop." }, { status: 400 });
    }
    if (inputUrl?.hostname === "sv.shopee.vn" && inputUrl.pathname.startsWith("/share-video/")) {
      return NextResponse.json({
        error: "video_link_not_product",
        message: "Link Shopee Video: mở giỏ hàng trong video → chọn sản phẩm → Chia sẻ → Sao chép link.",
      }, { status: 422 });
    }
    if (inputUrl?.hostname === "live.shopee.vn" || inputUrl?.pathname.startsWith("/live/")) {
      return NextResponse.json({
        error: "live_link_not_product",
        message: "Link Shopee Live: mở giỏ hàng trong livestream → chọn sản phẩm → Chia sẻ → Sao chép link.",
      }, { status: 422 });
    }
    const auth = await createSupabaseServerClient();
    const session = auth ? await auth.auth.getUser() : null;
    const subId = formatSubIdForUser(session?.data.user?.id);

    if (!rawUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    // Direct Official Lazada Open Platform Affiliate flow (no AccessTrade)
    if (isLazadaUrl(rawUrl)) {
      const [lazadaResult, boosterSettings] = await Promise.all([
        resolveLazadaProduct(rawUrl, { subId }),
        getBoosterSettings(),
      ]);

      if (!lazadaResult.ok || !lazadaResult.product) {
        return NextResponse.json(
          {
            error: lazadaResult.errorCode || "product_unresolved",
            message:
              lazadaResult.message ||
              "Chưa tìm thấy sản phẩm từ link Lazada này. Hãy sao chép lại link sản phẩm trên Lazada rồi thử lại.",
          },
          { status: lazadaResult.errorCode === "lazada_not_configured" ? 503 : 422 }
        );
      }

      const lp = lazadaResult.product;
      let finalName = lp.name;
      let finalImage = lp.imageUrl;
      let finalPrice = lp.price;
      let isVerifiedPrice = lp.isVerifiedPrice;

      // Best-effort OG metadata fallback only when /marketing/product/feed lacks price or image
      if (!finalName || !finalImage || finalPrice <= 0) {
        try {
          const metaRes = await fetch(lp.canonicalUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml",
              "Accept-Language": "vi-VN,vi;q=0.9",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(2200),
          });
          if (metaRes.ok) {
            const html = await metaRes.text();
            if (!finalImage) {
              const img = extractMeta(html, "og:image") || extractMeta(html, "twitter:image");
              if (img && img.startsWith("http")) finalImage = img;
            }
            if (!finalName) {
              const title =
                extractMeta(html, "og:title") ||
                html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
              if (title) {
                finalName = title
                  .replace(/&amp;/g, "&")
                  .replace(/\s*[|–-]\s*Lazada(\.vn)?.*$/i, "")
                  .trim();
              }
            }
            if (finalPrice <= 0) {
              const rawPriceStr =
                extractMeta(html, "product:price:amount") ||
                extractMeta(html, "og:price:amount");
              if (rawPriceStr) {
                const parsed = Number(rawPriceStr.replace(/[,.]/g, ""));
                if (Number.isFinite(parsed) && parsed > 1000) {
                  finalPrice = parsed;
                  isVerifiedPrice = true;
                }
              }
            }
          }
        } catch {}
      }

      if (!finalName) {
        finalName = "Sản phẩm Lazada";
      }

      const grossCommission =
        lp.grossCommission > 0
          ? lp.grossCommission
          : finalPrice > 0 && lp.commissionRatePercent > 0
            ? Math.round((finalPrice * lp.commissionRatePercent) / 100)
            : 0;

      let finalCashback = 0;
      let cashbackRate = 0;
      if (grossCommission > 0 || lp.commissionRatePercent > 0) {
        const boosted = boostCashbackRate(
          lp.commissionRatePercent,
          finalPrice,
          grossCommission > 0 ? grossCommission : undefined,
          boosterSettings
        );
        finalCashback = boosted.cashbackAmount;
        cashbackRate = boosted.finalRate;
      }

      let matchedVouchers: MatchedCoupon[] = [];
      let bestVoucherDiscount = 0;
      try {
        const allCoupons = await getVouchers();
        const matchResult = matchVouchersForProduct(finalPrice, "Lazada", allCoupons);
        matchedVouchers = matchResult.matched;
        bestVoucherDiscount = matchResult.bestDiscount;
      } catch (e) {
        console.error("[VoucherMatching] Lỗi so khớp mã giảm giá Lazada:", e);
      }

      const resolvedProduct: CalculatedProduct = {
        name: finalName,
        imageUrl: finalImage || "/brand/lazada-icon.png",
        price: finalPrice,
        originalPrice: finalPrice,
        cashback: finalCashback,
        platform: "Lazada",
        seller: lp.seller || "Lazada",
        trackedLink: lp.affiliateUrl,
        discountPercent: 0,
        savingsPercent: cashbackRate,
        isVerifiedPrice,
        priceType: isVerifiedPrice ? "exact" : "estimated",
        isExactCashback: true,
        cashbackRate,
        matchedVouchers,
        bestVoucherDiscount,
      };

      return NextResponse.json({
        success: true,
        product: resolvedProduct,
        trackedLink: lp.affiliateUrl,
      });
    }

    // Direct TikTok Shop Affiliate via RioHub Partner API (no AccessTrade)
    if (isTikTokUrl(rawUrl)) {
      const [rioResult, boosterSettings] = await Promise.all([
        resolveRioHubTikTokProduct(rawUrl, { subId }),
        getBoosterSettings(),
      ]);

      if (!rioResult.ok || !rioResult.product) {
        return NextResponse.json(
          {
            error: rioResult.errorCode || "product_unresolved",
            message:
              rioResult.message ||
              "Sản phẩm TikTok Shop này chưa hỗ trợ hoàn tiền hoặc link không hợp lệ.",
          },
          { status: rioResult.errorCode === "riohub_not_configured" ? 503 : 422 }
        );
      }

      const rp = rioResult.product;
      const finalPrice = rp.price;
      const finalOriginalPrice = rp.originalPrice > finalPrice ? rp.originalPrice : finalPrice;
      const grossCommission =
        rp.grossCommission > 0
          ? rp.grossCommission
          : finalPrice > 0 && rp.commissionRatePercent > 0
            ? Math.round((finalPrice * rp.commissionRatePercent) / 100)
            : 0;

      let finalCashback = 0;
      let cashbackRate = 0;
      if (grossCommission > 0 || rp.commissionRatePercent > 0) {
        const boosted = boostCashbackRate(
          rp.commissionRatePercent,
          finalPrice,
          grossCommission > 0 ? grossCommission : undefined,
          boosterSettings
        );
        finalCashback = boosted.cashbackAmount;
        cashbackRate = boosted.finalRate;
      }

      const discountPercent =
        finalOriginalPrice > finalPrice && finalPrice > 0
          ? Math.round(((finalOriginalPrice - finalPrice) / finalOriginalPrice) * 100)
          : 0;

      const resolvedProduct: CalculatedProduct = {
        name: rp.name || "Sản phẩm TikTok Shop",
        imageUrl: rp.imageUrl || "/brand/tiktok.svg",
        price: finalPrice,
        originalPrice: finalOriginalPrice,
        cashback: finalCashback,
        platform: "TikTok Shop",
        seller: rp.seller || "TikTok Shop",
        trackedLink: rp.affiliateUrl,
        discountPercent,
        savingsPercent: cashbackRate,
        isVerifiedPrice: rp.isVerifiedPrice,
        priceType: rp.isVerifiedPrice ? "exact" : "estimated",
        isExactCashback: true,
        cashbackRate,
        matchedVouchers: [],
        bestVoucherDiscount: 0,
      };

      return NextResponse.json({
        success: true,
        product: resolvedProduct,
        trackedLink: rp.affiliateUrl,
      });
    }

    const isShopeeFood = isShopeeFoodUrl(rawUrl);
    const isShopee = isShopeeUrl(rawUrl) || isShopeeFood;

    if (!isShopee) {
      return NextResponse.json(
        {
          error: "unsupported_platform",
          message: "DealHoàn hiện hỗ trợ nhận hoàn tiền cho link Shopee, ShopeeFood, Lazada và TikTok Shop.",
        },
        { status: 400 }
      );
    }

    const isTikTok = isTikTokUrl(rawUrl);

    let canonicalUrl = rawUrl;
    if (isShopeeFood || isShopeeShortlinkUrl(rawUrl)) {
      const unshortened = await resolveShopeeShortlink(rawUrl).catch(() => null);
      if (unshortened && unshortened !== rawUrl && !isShopeeErrorOrGateUrl(unshortened)) {
        canonicalUrl = unshortened;
      }
    }
    const isFoodResolved = isShopeeFood || isShopeeFoodUrl(canonicalUrl);
    let ogTitle: string | null = null;
    let ogImage: string | null = null;
    let extractedPrice: number | null = null;
    let showDiscount: number | null = null;

    // 1. Resolve Shopee and TikTok share/direct links through the same HoanNgay provider.
    const hoanNgayDirectPromise = (!isFoodResolved && (isShopee || isTikTok))
      ? lookupHoanNgayProduct(canonicalUrl).catch(() => null)
      : Promise.resolve(null);

    // 2. Concurrently expand shortlink or fetch OpenGraph metadata with quick 2500ms timeout
    const metadataPromise = (async () => {
      try {
        const fetchHeaders: HeadersInit = isFoodResolved
          ? {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            }
          : isShopee
            ? {
                "User-Agent":
                  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
              }
            : {
                "User-Agent":
                  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
              };

        const res = await fetch(canonicalUrl, {
          headers: fetchHeaders,
          redirect: "follow",
          signal: AbortSignal.timeout(2500),
        });

        if (res.ok) {
          const finalFetchedUrl = res.url || canonicalUrl;
          const html = await res.text();
          return { finalFetchedUrl, html };
        }
      } catch {}
      return null;
    })();

    // Await both tasks in parallel
    const [hoanNgayDirect, metaResult] = await Promise.all([
      hoanNgayDirectPromise,
      metadataPromise,
    ]);

    if (metaResult) {
      if (
        metaResult.finalFetchedUrl &&
        !isShopeeErrorOrGateUrl(metaResult.finalFetchedUrl) &&
        (!isFoodResolved || isShopeeFoodUrl(metaResult.finalFetchedUrl))
      ) {
        canonicalUrl = metaResult.finalFetchedUrl;
      }
      const html = metaResult.html;

      // Extract destination URL if shortlink contains CONFIG.httpUrl
      let unpackedUrl = "";
      const configMatch = html.match(/CONFIG\s*=\s*(\{[\s\S]*?\});/);
      if (configMatch) {
        const httpMatch = configMatch[1].match(/httpUrl:\s*"([^"]+)"/);
        if (httpMatch) {
          try {
            unpackedUrl = httpMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
          } catch {}
        }
      }
      if (!unpackedUrl) {
        const foodEmbed = html.match(
          /https?:\\?\/\\?\/(?:(?:www\.)?shopeefood\.vn|(?:www\.)?shopee\.vn\\?\/(?:universal-link\\?\/)?now-food)[^"'\\\s<>)]*/i
        );
        if (foodEmbed?.[0]) {
          unpackedUrl = foodEmbed[0].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
        }
      }

      // Detect Shopee Video (sv.shopee.vn, /share-video/, or share_obj=video)
      const isVideoLink =
        canonicalUrl.includes("sv.shopee.vn") ||
        canonicalUrl.includes("/share-video/") ||
        unpackedUrl.includes("sv.shopee.vn") ||
        unpackedUrl.includes("/share-video/") ||
        html.includes("sv.shopee.vn") ||
        html.includes("share_obj=video");

      if (isVideoLink) {
        return NextResponse.json({
          error: "video_link_not_product",
          message: "Link Shopee Video: mở giỏ hàng trong video → chọn sản phẩm → Chia sẻ → Sao chép link.",
        }, { status: 422 });
      }

      // Detect Shopee Live (live.shopee.vn, /live/, or share_obj=live)
      const isLiveLink =
        canonicalUrl.includes("live.shopee.vn") ||
        canonicalUrl.includes("/live/") ||
        unpackedUrl.includes("live.shopee.vn") ||
        unpackedUrl.includes("/live/") ||
        html.includes("live.shopee.vn") ||
        html.includes("share_obj=live");

      if (isLiveLink) {
        return NextResponse.json({
          error: "live_link_not_product",
          message: "Link Shopee Live: mở giỏ hàng trong livestream → chọn sản phẩm → Chia sẻ → Sao chép link.",
        }, { status: 422 });
      }

      // If shortlink unpacked into a direct product/food URL, use it as canonicalUrl
      if (unpackedUrl && isShopeeUrl(unpackedUrl) && !isShopeeErrorOrGateUrl(unpackedUrl)) {
        canonicalUrl = unpackedUrl;
      }

      // Extract image
      const img = extractMeta(html, "og:image") || extractMeta(html, "twitter:image");
      if (img && img.startsWith("http")) {
        ogImage = img;
      }

      // Extract title
      const title =
        extractMeta(html, "og:title") ||
        extractMeta(html, "twitter:title") ||
        html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
      if (title) {
        const cleaned = title
          .replace(/&amp;/g, "&")
          .replace(/\s*[|–-]\s*(Shopee Việt Nam|ShopeeFood(\.vn)?|Now\.vn|Lazada\.vn|TikTok Shop|Tiki\.vn|Mua và Bán.*|Đặt Món.*)$/i, "")
          .trim();
        const cleanedLower = cleaned.toLowerCase();
        const isGenericShopeeFood =
          cleanedLower.includes("đặt đồ ăn trực tuyến ở 25 tỉnh thành") ||
          cleanedLower.includes("giao hàng tận nơi") ||
          cleanedLower.includes("đặt món & giao ship tận nơi") ||
          cleanedLower.includes("mkt single page application") ||
          cleanedLower.includes("error_page") ||
          cleanedLower.includes("page not found") ||
          cleanedLower.includes("access denied") ||
          cleanedLower.startsWith("shopeefood") ||
          cleanedLower.startsWith("now.vn") ||
          cleanedLower === "shopee" ||
          cleanedLower === "error" ||
          cleanedLower === "404" ||
          cleanedLower === "đăng nhập";

        if (!isGenericShopeeFood && cleaned.length > 3 && !cleanedLower.startsWith("shopee việt nam")) {
          ogTitle = cleaned;
        }
      }

      // Extract discount percent from Shopee SSR
      const discountMatch = html.match(/"show_discount":\s*(\d+)/i);
      if (discountMatch) {
        const parsedDisc = Number(discountMatch[1]);
        if (parsedDisc > 0 && parsedDisc < 95) {
          showDiscount = parsedDisc;
        }
      }

      // Extract price if exposed in OpenGraph
      const rawPriceStr =
        extractMeta(html, "product:price:amount") ||
        extractMeta(html, "og:price:amount") ||
        extractMeta(html, "twitter:data1");
      if (rawPriceStr) {
        const parsed = Number(rawPriceStr.replace(/[,.]/g, ""));
        if (Number.isFinite(parsed) && parsed > 1000) {
          extractedPrice = parsed;
        }
      }
    }

    const isCurrentShopeeFood = isShopeeFood || isShopeeFoodUrl(canonicalUrl);
    const isCurrentShopee = isShopeeUrl(canonicalUrl) || isShopee;
    const isCurrentTikTok = isTikTokUrl(canonicalUrl) || isTikTok;

    // Apply Shopee discount metadata only to Shopee; retry canonical links if needed.
    let hoanNgayProduct = hoanNgayDirect;
    if (!isCurrentShopeeFood) {
      if (hoanNgayProduct && isCurrentShopee && showDiscount && showDiscount > 0) {
        const realOrig = Math.round((hoanNgayProduct.price / (1 - showDiscount / 100)) / 1000) * 1000;
        if (realOrig > hoanNgayProduct.price) {
          hoanNgayProduct = { ...hoanNgayProduct, originalPrice: realOrig };
        }
      } else if (!hoanNgayProduct && (isCurrentShopee || isCurrentTikTok)) {
        hoanNgayProduct = await lookupHoanNgayProduct(canonicalUrl, showDiscount).catch(() => null);
      }
    }

    // Canonicalize with the provider product URL, not an upstream affiliate link.
    if (hoanNgayProduct?.productLink) {
      canonicalUrl = hoanNgayProduct.productLink;
    }

    // 3. Query AccessTrade product datafeed (exact SKU match for real price & CDN image)
    const atProduct = (!isCurrentShopeeFood && !hoanNgayProduct)
      ? await lookupAccessTradeProduct(canonicalUrl).catch(() => null)
      : null;

    // A short-link slug is not a product identity. Never fabricate a receipt
    // from category defaults when product providers cannot resolve the link.
    // Note: ShopeeFood operates on flat restaurant cashback without physical SKU feeds.
    const providerProduct = hoanNgayProduct || atProduct;
    if (!isCurrentShopeeFood) {
      if (!providerProduct?.name?.trim() || !providerProduct.isVerifiedPrice || !Number.isFinite(providerProduct.price) || providerProduct.price <= 0) {
        return NextResponse.json({
          error: "product_unresolved",
          message: "Chưa tìm thấy sản phẩm từ link này. Hãy sao chép lại link sản phẩm trên Shopee rồi thử lại.",
        }, { status: 422 });
      }
    }

    // 4. Fallback to local catalog resolution if external providers yielded no match
    const baseProduct = resolveProductLocally(canonicalUrl, [], ogTitle);

    const finalPlatform: Platform = isCurrentShopeeFood
      ? "ShopeeFood"
      : hoanNgayProduct
        ? isCurrentTikTok ? "TikTok Shop" : "Shopee"
        : atProduct?.platform
          ? atProduct.platform
          : canonicalUrl.toLowerCase().includes("tiktok")
            ? "TikTok Shop"
            : canonicalUrl.toLowerCase().includes("lazada")
              ? "Lazada"
              : isCurrentShopee
                ? baseProduct.platform === "Shopee"
                  ? "Shopee"
                  : "Shopee Mall"
                : "Shopee";

    const isVerifiedPrice = isCurrentShopeeFood
      ? false
      : Boolean(
          hoanNgayProduct?.isVerifiedPrice ||
          atProduct?.isVerifiedPrice ||
          extractedPrice !== null
        );

    const priceType = isCurrentShopeeFood
      ? "estimated"
      : (hoanNgayProduct?.isVerifiedPrice || atProduct?.isVerifiedPrice || extractedPrice !== null)
        ? "exact"
        : "estimated";

    const finalName = isCurrentShopeeFood
      ? (ogTitle || baseProduct.name || "Quán ngon ShopeeFood")
      : (hoanNgayProduct?.name || atProduct?.name || ogTitle || baseProduct.name);

    const finalImage = isCurrentShopeeFood
      ? (ogImage || (baseProduct.imageUrl && !baseProduct.imageUrl.includes("unsplash.com") && baseProduct.imageUrl !== "/brand/shopeefood-logo.png" ? baseProduct.imageUrl : null) || "/brand/shopeefood-icon.png")
      : (hoanNgayProduct?.imageUrl || atProduct?.imageUrl || ogImage || baseProduct.imageUrl);

    const finalPrice = isCurrentShopeeFood
      ? (extractedPrice || 0)
      : (hoanNgayProduct?.price ?? atProduct?.price ?? (extractedPrice || baseProduct.price));

    const finalOriginalPrice = isCurrentShopeeFood
      ? (finalPrice > 0
          ? (baseProduct.originalPrice > finalPrice
              ? baseProduct.originalPrice
              : Math.round((finalPrice * 1.3) / 1000) * 1000)
          : 0)
      : (hoanNgayProduct?.originalPrice ??
         atProduct?.originalPrice ??
         (baseProduct.originalPrice > finalPrice
           ? baseProduct.originalPrice
           : Math.round((finalPrice * 1.28) / 1000) * 1000));

     // Tính toán hoa hồng Shopee toàn phần sát thực tế theo ngành hàng & người bán:
    // Shopee Affiliate trả = Hoa hồng người bán (sellerCommission) + Hoa hồng cơ bản ngành hàng (uncapped).
    if (isCurrentShopee && hoanNgayProduct && finalPrice > 0) {
      const breadcrumbCat = metaResult?.html ? extractShopeeBreadcrumbCategory(metaResult.html) : null;
      const categoryText = [breadcrumbCat, finalName].filter(Boolean).join(" ");
      const catRate = typeof getShopeeCategoryRate === "function" ? getShopeeCategoryRate(categoryText) : 0.0368;
      const uncappedShopeeCom = Math.round(finalPrice * catRate);
      const sellerCom = hoanNgayProduct.sellerCommission || 0;
      const preciseGross = sellerCom + uncappedShopeeCom;

      if (preciseGross > 0) {
        hoanNgayProduct.commission = preciseGross;
        hoanNgayProduct.cashbackRate = Number(((preciseGross / finalPrice) * 100).toFixed(2));
      }
    }

    const hasRealCommission = isCurrentShopeeFood
      ? true
      : Boolean(
          typeof hoanNgayProduct?.commission === "number" ||
          typeof hoanNgayProduct?.cashbackRate === "number"
        );

    if (!hasRealCommission) {
      return NextResponse.json({ error: "commission_unverified", message: "Chưa lấy được tiền hoàn. Bạn thử lại sau nhé." }, { status: 422 });
    }
    let finalCashback = 0;
    let cashbackRate = 0;
    const boosterSettings = await getBoosterSettings();

    if (isCurrentShopeeFood) {
      // ShopeeFood gross affiliate commission ~6.8%. Net rate applies admin's userCashbackPercent:
      const userShare = Math.max(0.5, Math.min(0.98, (boosterSettings.userCashbackPercent ?? 88.0) / 100));
      const grossFoodRate = 6.8;
      cashbackRate = Number((grossFoodRate * userShare).toFixed(1));
      finalCashback = finalPrice > 0 ? Math.round(finalPrice * (cashbackRate / 100)) : 0;
    } else if (hasRealCommission && (hoanNgayProduct?.cashbackRate ?? 0) === 0 && (hoanNgayProduct?.commission ?? 0) === 0) {
      finalCashback = 0;
      cashbackRate = 0;
    } else if (hoanNgayProduct?.commission && hoanNgayProduct.commission > 0 && finalPrice > 0) {
      const rawRate = Number(((hoanNgayProduct.commission / finalPrice) * 100).toFixed(2));
      const boosted = boostCashbackRate(
        rawRate,
        finalPrice,
        hoanNgayProduct.commission,
        boosterSettings,
        hoanNgayProduct.cap
      );
      finalCashback = boosted.cashbackAmount;
      cashbackRate = boosted.finalRate;
    } else if (hoanNgayProduct?.cashbackRate && hoanNgayProduct.cashbackRate > 0) {
      const boosted = boostCashbackRate(
        hoanNgayProduct.cashbackRate,
        finalPrice,
        hoanNgayProduct.commission,
        boosterSettings,
        hoanNgayProduct.cap
      );
      finalCashback = boosted.cashbackAmount;
      cashbackRate = boosted.finalRate;
    }

    const discountPercent =
      finalOriginalPrice > finalPrice
        ? Math.round(((finalOriginalPrice - finalPrice) / finalOriginalPrice) * 100)
        : 0;

    const savingsPercent = cashbackRate;

    // NOTE ON COMMISSION ATTRIBUTION:
    // We intentionally route outbound clicks through our DIRECT Shopee Affiliate link:
    // https://s.shopee.vn/an_redir?affiliate_id=17333200656
    // AccessTrade is used SOLELY as a read-only data source for product prices and images.
    // 100% of all affiliate commissions go directly to DealHoàn without any intermediary.
    const requestHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || (requestHost?.includes("localhost") ? "http" : "https");
    const siteBase = requestHost
      ? `${proto}://${requestHost}`
      : request.nextUrl.origin || process.env.NEXT_PUBLIC_SITE_URL || "https://dealhoan.com";
    let trackedLink: string;
    if (isCurrentShopeeFood) {
      trackedLink = buildShopeeFoodAffiliateUrl(canonicalUrl, {
        affiliateId: "17333200656",
        subId,
      });
    } else if (isShopee) {
      const cleanShopeeLink =
        hoanNgayProduct?.shopId && hoanNgayProduct?.itemId
          ? `https://shopee.vn/product/${hoanNgayProduct.shopId}/${hoanNgayProduct.itemId}`
          : cleanShopeeUrl(canonicalUrl);
      trackedLink = buildShopeeAffiliateUrl(cleanShopeeLink, {
        affiliateId: "17333200656",
        subId,
      });
    } else if (isCurrentTikTok) {
      const atToken = getAccessTradeToken();
      const atResult = await generateAccessTradeTikTokLink(cleanTikTokUrl(canonicalUrl), { subId, authToken: atToken });
      trackedLink = atResult.success && atResult.affiliateUrl
        ? atResult.affiliateUrl
        : buildCustomShortUrl(canonicalUrl, { baseUrl: siteBase, subId });
    } else {
      trackedLink = buildCustomShortUrl(canonicalUrl, {
        baseUrl: siteBase,
        subId,
        shopId: hoanNgayProduct?.shopId,
        itemId: hoanNgayProduct?.itemId,
      });
    }

    // So khớp mã giảm giá Shopee tối ưu cho sản phẩm này
    let matchedVouchers: MatchedCoupon[] = [];
    let bestVoucherDiscount = 0;
    try {
      const allCoupons = await getVouchers();
      const matchResult = matchVouchersForProduct(finalPrice, finalPlatform, allCoupons);
      matchedVouchers = matchResult.matched;
      bestVoucherDiscount = matchResult.bestDiscount;
    } catch (e) {
      console.error("[VoucherMatching] Lỗi so khớp mã giảm giá:", e);
    }

    const resolvedProduct: CalculatedProduct = {
      name: finalName,
      imageUrl: finalImage,
      price: finalPrice,
      originalPrice: finalOriginalPrice,
      cashback: finalCashback,
      platform: finalPlatform,
      seller: isCurrentShopeeFood ? "ShopeeFood" : (atProduct?.seller || hoanNgayProduct?.seller || baseProduct.seller),
      trackedLink,
      discountPercent,
      savingsPercent,
      isVerifiedPrice,
      priceType,
      cap: isCurrentShopeeFood ? 500000 : hoanNgayProduct?.cap,
      isExactCashback: hasRealCommission,
      cashbackRate,
      matchedVouchers,
      bestVoucherDiscount,
    };

    return NextResponse.json({
      success: true,
      product: resolvedProduct,
      trackedLink,
    });
  } catch (err: unknown) {
    return handleApiError(err, "Không thể kiểm tra hoàn tiền cho sản phẩm này. Vui lòng thử lại sau.");
  }
}

