/** Only product rows explicitly returned by the Xtra feed; never shop-level "up to" rates. */
export function normalizeXtraProduct(item, { fromXtraFeed = false, now = Date.now(), marginPercent = 12 } = {}) {
  if (!item || typeof item !== "object") return null;
  if (!fromXtraFeed && item.is_xtra !== true) return null;
  const shop = String(item.shop_id ?? item.shopId ?? "");
  const id = String(item.item_id ?? item.itemId ?? "");
  const name = item.item_name ?? item.product_name;
  const price = Number(item.price);
  const rawRate = Number(item.commission_rate ?? item.commissionRate);
  const rate = rawRate > 1 ? rawRate / 100 : rawRate;
  if (!/^\d+$/.test(shop) || !/^\d+$/.test(id) || Number(shop) <= 0 || Number(id) <= 0 || typeof name !== "string" || !name.trim()) return null;
  if (!Number.isFinite(price) || price <= 0 || price > 1500000 || !Number.isFinite(rate) || rate <= 0 || rate > 1) return null;
  if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent > 100) return null;
  const cashback = Math.floor(Math.min(price * rate * (1 - marginPercent / 100), 500000));
  if (cashback / price < .1) return null;
  const image = item.image_url ?? item.image;
  return {
    id: `shopee-xtra-${shop}-${id}`, name: name.trim(), platform: "Shopee", seller: item.shop_name || "Shopee",
    price, originalPrice: price, discountPercent: 0, cashback, dealScore: 0,
    sold: Number.isFinite(item.sales) && item.sales >= 0 ? item.sales : null,
    ratingAverage: 0, reviewCount: 0,
    imageUrl: typeof image === "string" && image.startsWith("https://") ? image : null,
    productUrl: `https://shopee.vn/product/${shop}/${id}`,
    affiliateOffer: { source: "shopee-xtra", commissionRate: rate, checkedAt: now },
  };
}
