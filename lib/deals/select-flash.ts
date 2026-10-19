import { xtraExpiresAt } from "../../supabase/functions/_shared/xtra-slots.mjs";
import { FLASH_COUNT } from "./config";
import type { Deal } from "./types";

export const MIN_FLASH_CASHBACK_RATE = 0.10;
const MAX_PRICE = 1_500_000;

function isAvailable(deal: Deal): boolean {
  if (!deal || typeof deal !== "object") return false;
  if (deal.availability && deal.availability.status === "missing") return false;
  return true;
}

function isValidPriceAndCashback(deal: Deal): boolean {
  return (
    Number.isFinite(deal.price) &&
    deal.price > 0 &&
    deal.price <= MAX_PRICE &&
    Number.isFinite(deal.cashback) &&
    deal.cashback > 0 &&
    deal.cashback <= deal.price
  );
}

function getCashbackRate(deal: Deal): number {
  if (!deal.price || deal.price <= 0) return 0;
  return deal.cashback / deal.price;
}

function getDedupeKey(d: Deal): string {
  if (
    d.productUrl &&
    d.productUrl !== "#" &&
    d.productUrl !== "https://shopee.vn" &&
    d.productUrl !== "https://shopee.vn/" &&
    d.productUrl !== "https://lazada.vn" &&
    d.productUrl !== "https://lazada.vn/"
  ) {
    return d.productUrl;
  }
  return d.id;
}

/** Rank actual expected buyer cashback, prioritizing high-percentage deals, never empty. */
export function pickFlash(deals: Deal[], now = Date.now()): Deal[] {
  if (!Array.isArray(deals) || deals.length === 0) return [];

  const seen = new Set<string>();

  // 1. Nhóm ưu tiên cao nhất: Tỷ lệ hoàn >= 10%, giá <= 1.5M, còn hàng
  const tier1 = deals.filter(
    (d) => isAvailable(d) && isValidPriceAndCashback(d) && getCashbackRate(d) >= MIN_FLASH_CASHBACK_RATE
  );

  // 2. Nhóm bổ sung: Tỷ lệ hoàn từ 5% đến 10%, giá <= 1.5M, còn hàng
  const tier2 = deals.filter(
    (d) =>
      isAvailable(d) &&
      isValidPriceAndCashback(d) &&
      getCashbackRate(d) >= 0.05 &&
      getCashbackRate(d) < MIN_FLASH_CASHBACK_RATE
  );

  // 3. Nhóm dự phòng: Giá <= 1.5M, có hoàn tiền
  const tier3 = deals.filter(
    (d) => isAvailable(d) && isValidPriceAndCashback(d) && getCashbackRate(d) < 0.05
  );

  const combined = [...tier1, ...tier2, ...tier3];

  return combined
    .sort((a, b) => {
      const rateA = getCashbackRate(a);
      const rateB = getCashbackRate(b);

      // Ưu tiên sản phẩm Hoa hồng Xtra có hoa hồng cao
      const isXtraA = a.affiliateOffer?.source === "shopee-xtra";
      const isXtraB = b.affiliateOffer?.source === "shopee-xtra";
      if (isXtraA !== isXtraB) {
        return isXtraB ? 1 : -1;
      }

      // Xếp theo tỷ lệ % hoàn tiền (87%, 82%, 77%...)
      if (Math.abs(rateB - rateA) >= 0.03) {
        return rateB - rateA;
      }

      // Nếu tỷ lệ hoàn tương đương nhau thì xếp theo số tiền hoàn lớn hơn
      if (Math.abs(b.cashback - a.cashback) >= 3000) {
        return b.cashback - a.cashback;
      }

      return (a.id || "").localeCompare(b.id || "");
    })
    .filter((d) => {
      const key = getDedupeKey(d);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, FLASH_COUNT);
}
