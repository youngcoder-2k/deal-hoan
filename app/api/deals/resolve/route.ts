import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  buildShopeeAffiliateUrl,
  buildShopeeFoodAffiliateUrl,
  cleanShopeeUrl,
  isShopeeUrl,
  isShopeeFoodUrl,
  isTikTokUrl,
  cleanTikTokUrl,
  generateAccessTradeTikTokLink,
  buildCustomShortUrl,
  extractUrlFromText,
  formatSubIdForUser,
} from "@/lib/deals/affiliate";
import { cashbackFor } from "@/lib/deals/score";
import type { Platform } from "@/lib/deals/types";
import { resolveProductLocally, type CalculatedProduct } from "@/lib/deals/resolve";
import { lookupAccessTradeProduct } from "@/lib/deals/providers/accesstrade";
import { lookupHoanNgayProduct } from "@/lib/deals/providers/hoanngay";
import { boostCashbackRate } from "@/lib/deals/cashback-booster";
import { getAccessTradeToken } from "@/lib/deals/shopee-sync-config";

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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
    const isFoodHost = host.includes("shopeefood") || host.includes("food.shopee") || host === "now.vn" || host.endsWith(".now.vn");
    const allowedHost = isFoodHost || ["shopee.vn", "shopeefood.vn", "now.vn", "shope.ee", "shp.ee"].some(domain => host === domain || host.endsWith(`.${domain}`));
    if (!allowedHost) {
      return NextResponse.json({ error: "unsupported_platform", message: "Hãy dán link sản phẩm Shopee hoặc ShopeeFood." }, { status: 400 });
    }
    if (inputUrl?.hostname === "sv.shopee.vn" && inputUrl.pathname.startsWith("/share-video/")) {
      return NextResponse.json({
        error: "video_link_not_product",
        message: "Link video: mở sản phẩm trong video → Chia sẻ → Sao chép link.",
      }, { status: 422 });
    }
    const auth = await createSupabaseServerClient();
    const session = auth ? await auth.auth.getUser() : null;
    const subId = formatSubIdForUser(session?.data.user?.id);

    if (!rawUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    const isShopeeFood = isShopeeFoodUrl(rawUrl);
    const isShopee = isShopeeUrl(rawUrl) || isShopeeFood;

    if (!isShopee) {
      return NextResponse.json(
        {
          error: "unsupported_platform",
          message: "DealHoàn hiện chỉ hỗ trợ nhận hoàn tiền cho link Shopee và ShopeeFood.",
        },
        { status: 400 }
      );
    }

    const isTikTok = isTikTokUrl(rawUrl);

    let canonicalUrl = rawUrl;
    let ogTitle: string | null = null;
    let ogImage: string | null = null;
    let extractedPrice: number | null = null;
    let showDiscount: number | null = null;

    // 1. Resolve Shopee and TikTok share/direct links through the same HoanNgay provider.
    const hoanNgayDirectPromise = (!isShopeeFood && (isShopee || isTikTok))
      ? lookupHoanNgayProduct(rawUrl).catch(() => null)
      : Promise.resolve(null);

    // 2. Concurrently expand shortlink or fetch OpenGraph metadata with quick 1800ms timeout
    const metadataPromise = (async () => {
      try {
        const fetchHeaders: HeadersInit = isShopee
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

        const res = await fetch(rawUrl, {
          headers: fetchHeaders,
          redirect: "follow",
          signal: AbortSignal.timeout(1800),
        });

        if (res.ok) {
          const finalFetchedUrl = res.url || rawUrl;
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
      canonicalUrl = metaResult.finalFetchedUrl;
      const html = metaResult.html;

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
        if (cleaned.length > 3 && !cleaned.toLowerCase().startsWith("shopee việt nam")) {
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
      ? (ogImage || baseProduct.imageUrl || "/brand/shopeefood-logo.png")
      : (hoanNgayProduct?.imageUrl || atProduct?.imageUrl || ogImage || baseProduct.imageUrl);

    const finalPrice = isCurrentShopeeFood
      ? (extractedPrice || baseProduct.price || 65000)
      : (hoanNgayProduct?.price ?? atProduct?.price ?? (extractedPrice || baseProduct.price));

    const finalOriginalPrice = isCurrentShopeeFood
      ? (baseProduct.originalPrice > finalPrice
          ? baseProduct.originalPrice
          : Math.round((finalPrice * 1.3) / 1000) * 1000)
      : (hoanNgayProduct?.originalPrice ??
         atProduct?.originalPrice ??
         (baseProduct.originalPrice > finalPrice
           ? baseProduct.originalPrice
           : Math.round((finalPrice * 1.28) / 1000) * 1000));

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

    if (isCurrentShopeeFood) {
      // ShopeeFood fixed rate 6.0%
      cashbackRate = 6.0;
      finalCashback = Math.round((finalPrice * 0.06) / 1000) * 1000;
    } else if (hasRealCommission && (hoanNgayProduct?.cashbackRate ?? 0) === 0 && (hoanNgayProduct?.commission ?? 0) === 0) {
      finalCashback = 0;
      cashbackRate = 0;
    } else if (hoanNgayProduct?.cashbackRate && hoanNgayProduct.cashbackRate > 0) {
      const boosted = boostCashbackRate(
        hoanNgayProduct.cashbackRate,
        finalPrice,
        hoanNgayProduct.commission,
        undefined,
        hoanNgayProduct.cap
      );
      finalCashback = boosted.cashbackAmount;
      cashbackRate = boosted.finalRate;
    } else if (hoanNgayProduct?.commission && hoanNgayProduct.commission > 0 && finalPrice > 0) {
      const rawRate = Number(((hoanNgayProduct.commission / finalPrice) * 100).toFixed(2));
      const boosted = boostCashbackRate(
        rawRate,
        finalPrice,
        hoanNgayProduct.commission,
        undefined,
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
      : request.nextUrl.origin || process.env.NEXT_PUBLIC_SITE_URL || "https://dealhoan.vn";
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
    };

    return NextResponse.json({
      success: true,
      product: resolvedProduct,
      trackedLink,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

