import { NextRequest, NextResponse } from "next/server";
import { checkAdminApiAuth } from "@/lib/auth/admin-server";
import { getCuratedXtraDeals, saveCuratedXtraDeals } from "@/lib/deals/providers/curated-xtra";
import { lookupFastShopeeProduct } from "@/lib/deals/providers/hoanngay";
import { cleanShopeeUrl } from "@/lib/deals/affiliate";
import { dealScore } from "@/lib/deals/score";
import type { Deal } from "@/lib/deals/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await checkAdminApiAuth(request);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const deals = getCuratedXtraDeals();
  return NextResponse.json({ success: true, deals });
}

export async function POST(request: NextRequest) {
  const auth = await checkAdminApiAuth(request);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const rawUrls: string[] = Array.isArray(body.urls)
    ? body.urls
    : typeof body.urls === "string"
    ? body.urls.split("\n").map((u: string) => u.trim()).filter(Boolean)
    : [];

  const commissionPercent = Number(body.commissionPercent || 60);
  const rate = Math.max(0.1, Math.min(0.9, commissionPercent / 100));

  if (rawUrls.length === 0) {
    return NextResponse.json({ error: "Không tìm thấy link sản phẩm hợp lệ" }, { status: 400 });
  }

  const existingDeals = getCuratedXtraDeals();
  const addedDeals: Deal[] = [];

  for (let i = 0; i < rawUrls.length; i++) {
    const rawUrl = rawUrls[i];
    const cleanUrl = cleanShopeeUrl(rawUrl);

    let name = `Sản phẩm Hoa hồng Xtra #${existingDeals.length + addedDeals.length + 1}`;
    let price = 89000;
    let originalPrice = 149000;
    let imageUrl = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80";
    let seller = "Shopee (Hoa hồng Xtra)";

    try {
      const fastProduct = await lookupFastShopeeProduct(cleanUrl);
      if (fastProduct && fastProduct.price > 0) {
        name = fastProduct.name || name;
        price = fastProduct.price;
        originalPrice = fastProduct.originalPrice || Math.round((price * 1.4) / 1000) * 1000;
        if (fastProduct.imageUrl) imageUrl = fastProduct.imageUrl;
        if (fastProduct.seller) seller = fastProduct.seller;
      }
    } catch {}

    const discountPercent = originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
    const rawCashback = Math.round(price * rate);
    const cashback = Math.min(Math.round(rawCashback / 1000) * 1000, 500000);

    const deal: Deal = {
      id: `xtra-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      platform: "Shopee",
      seller,
      price,
      originalPrice,
      discountPercent,
      cashback,
      dealScore: dealScore({
        discountPercent,
        price,
        cashback,
        ratingAverage: 4.9,
        reviewCount: 350,
        sold: 1200,
      }),
      sold: 1200,
      ratingAverage: 4.9,
      reviewCount: 350,
      imageUrl,
      productUrl: cleanUrl,
    };

    addedDeals.push(deal);
  }

  const updatedDeals = [...addedDeals, ...existingDeals];
  saveCuratedXtraDeals(updatedDeals);

  return NextResponse.json({
    success: true,
    message: `Đã nhập thành công ${addedDeals.length} sản phẩm Hoa hồng Xtra vào Deal chớp nhoáng!`,
    deals: updatedDeals,
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await checkAdminApiAuth(request);
  if (!auth.isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || id === "all") {
    saveCuratedXtraDeals([]);
    return NextResponse.json({ success: true, message: "Đã xóa toàn bộ sản phẩm Hoa hồng Xtra thủ công" });
  }

  const deals = getCuratedXtraDeals().filter((d) => d.id !== id);
  saveCuratedXtraDeals(deals);
  return NextResponse.json({ success: true, message: "Đã xóa deal thành công", deals });
}
