import { NextRequest, NextResponse } from "next/server";
import {
  buildShopeeAffiliateUrl,
  cleanShopeeUrl,
  isShopeeUrl,
  isTikTokUrl,
  cleanTikTokUrl,
  generateAccessTradeTikTokLink,
  buildCustomShortUrl,
  formatSubIdForUser,
} from "@/lib/deals/affiliate";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawUrl = body.url ? String(body.url).trim() : "";
    const subId = formatSubIdForUser(body.subId);

    if (!rawUrl) {
      return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
    }

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    const origin = host ? `${proto}://${host}` : request.nextUrl.origin || "https://dealhoan.vn";

    // 1. SHOPEE
    if (isShopeeUrl(rawUrl)) {
      const cleanUrl = cleanShopeeUrl(rawUrl);
      const affiliateUrl = buildShopeeAffiliateUrl(cleanUrl, { subId });
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

    // 2. TIKTOK SHOP (Via AccessTrade API)
    if (isTikTokUrl(rawUrl)) {
      const cleanUrl = cleanTikTokUrl(rawUrl);
      const atResult = await generateAccessTradeTikTokLink(cleanUrl, { subId });

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
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
