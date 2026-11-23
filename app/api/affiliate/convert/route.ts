import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody, handleApiError } from "@/lib/api/response";
import {
  buildShopeeAffiliateUrl,
  buildShopeeFoodAffiliateUrl,
  cleanShopeeUrl,
  isShopeeUrl,
  isShopeeFoodUrl,
  isLazadaUrl,
  cleanLazadaUrl,
  isTikTokUrl,
  cleanTikTokUrl,
  generateAccessTradeTikTokLink,
  buildCustomShortUrl,
  formatSubIdForUser,
  DEFAULT_SHOPEE_AFFILIATE_ID,
} from "@/lib/deals/affiliate";
import { generateLazadaAffiliateLink } from "@/lib/deals/lazada-affiliate";
import { getAccessTradeToken } from "@/lib/deals/shopee-sync-config";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await parseJsonBody<Record<string, unknown>>(request)) || {};
    const rawUrl = body.url ? String(body.url).trim() : "";
    const auth = await createSupabaseServerClient();
    const session = auth ? await auth.auth.getUser() : null;
    const subId = formatSubIdForUser(session?.data.user?.id);

    if (!rawUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    const origin = host ? `${proto}://${host}` : request.nextUrl.origin || "https://dealhoan.com";

    // 1. SHOPEEFOOD
    if (isShopeeFoodUrl(rawUrl)) {
      const cleanUrl = cleanShopeeUrl(rawUrl);
      const affiliateUrl = buildShopeeFoodAffiliateUrl(cleanUrl, {
        affiliateId: DEFAULT_SHOPEE_AFFILIATE_ID,
        subId,
      });
      const customShortLink = buildCustomShortUrl(cleanUrl, {
        baseUrl: origin,
        subId,
      });

      return NextResponse.json({
        success: true,
        platform: "shopeefood",
        isShopeeFood: true,
        cleanUrl,
        affiliateUrl,
        shortUrl: customShortLink,
        trackedLink: affiliateUrl,
        hasCommission: true,
      });
    }

    // 2. SHOPEE
    if (isShopeeUrl(rawUrl)) {
      const cleanUrl = cleanShopeeUrl(rawUrl);
      const affiliateUrl = buildShopeeAffiliateUrl(cleanUrl, {
        affiliateId: DEFAULT_SHOPEE_AFFILIATE_ID,
        subId,
      });
      const customShortLink = buildCustomShortUrl(cleanUrl, {
        baseUrl: origin,
        subId,
      });

      return NextResponse.json({
        success: true,
        platform: "shopee",
        isShopee: true,
        cleanUrl,
        affiliateUrl,
        shortUrl: customShortLink,
        trackedLink: affiliateUrl,
        hasCommission: true,
      });
    }

    // 3. LAZADA (Direct Official Lazada Open Platform API — no AccessTrade)
    if (isLazadaUrl(rawUrl)) {
      const cleanUrl = cleanLazadaUrl(rawUrl);
      const lazadaRes = await generateLazadaAffiliateLink(cleanUrl, { subId });
      const customShortLink = buildCustomShortUrl(cleanUrl, {
        baseUrl: origin,
        subId,
      });

      return NextResponse.json({
        success: true,
        platform: "lazada",
        isLazada: true,
        cleanUrl,
        affiliateUrl: lazadaRes.affiliateUrl,
        shortUrl: lazadaRes.success ? lazadaRes.affiliateUrl : customShortLink,
        trackedLink: lazadaRes.affiliateUrl,
        hasCommission: lazadaRes.success && lazadaRes.commissionRatePercent > 0,
        commissionRatePercent: lazadaRes.commissionRatePercent,
        message: lazadaRes.success
          ? "Đã gắn mã hoàn tiền Lazada Affiliate chính chủ"
          : (lazadaRes.error || "Không thể tạo link Lazada Affiliate cho sản phẩm này"),
      });
    }

    // 4. TIKTOK SHOP (Via AccessTrade API)
    if (isTikTokUrl(rawUrl)) {
      const cleanUrl = cleanTikTokUrl(rawUrl);
      const atToken = getAccessTradeToken();
      const atResult = await generateAccessTradeTikTokLink(cleanUrl, { subId, authToken: atToken });

      const customShortLink = buildCustomShortUrl(cleanUrl, {
        baseUrl: origin,
        subId,
      });

      return NextResponse.json({
        success: true,
        platform: "tiktok",
        isTikTok: true,
        cleanUrl,
        affiliateUrl: atResult.affiliateUrl,
        shortUrl: atResult.shortUrl || customShortLink,
        trackedLink: atResult.affiliateUrl,
        hasCommission: atResult.success,
        message: atResult.success
          ? "Đã gắn mã hoàn tiền TikTok Shop qua AccessTrade"
          : (atResult.message || "Sản phẩm chưa mở hoa hồng affiliate"),
      });
    }

    // 3. OTHER PLATFORMS
    const customShortLink = buildCustomShortUrl(rawUrl, {
      baseUrl: origin,
      subId,
    });

    return NextResponse.json({
      success: true,
      platform: "other",
      cleanUrl: rawUrl,
      affiliateUrl: rawUrl,
      shortUrl: customShortLink,
      trackedLink: customShortLink,
      hasCommission: false,
    });
  } catch (err: unknown) {
    return handleApiError(err, "Không thể chuyển đổi liên kết lúc này.");
  }
}
