import { xtraExpiresAt } from "../../supabase/functions/_shared/xtra-slots.mjs";
import { FLASH_COUNT } from "./config";
import type { Deal } from "./types";

export const MIN_FLASH_CASHBACK_RATE = 0.10;
const MAX_PRICE = 1_500_000;

function eligible(deal: Deal, now: number): boolean {
  if (!deal || typeof deal !== "object") return false;
  const check = deal.availability;
  if (!check || check.status !== "available" || !Number.isFinite(check.checkedAt) || check.checkedAt > now || now > xtraExpiresAt(check.checkedAt)) return false;
  const offer = deal.affiliateOffer;
  if (!offer || offer.source !== "shopee-xtra") return false;
  if (![deal.price, deal.cashback, offer.commissionRate, offer.checkedAt].every(Number.isFinite)) return false;
  if (deal.price <= 0 || deal.price > MAX_PRICE || deal.cashback <= 0 || deal.cashback > deal.price) return false;
  if (offer.commissionRate < MIN_FLASH_CASHBACK_RATE || offer.commissionRate > 1) return false;
  if (offer.checkedAt > now || now > xtraExpiresAt(offer.checkedAt)) return false;
  if (deal.cashback / deal.price < MIN_FLASH_CASHBACK_RATE) return false;
  try {
    const url = new URL(deal.productUrl);
    return url.protocol === "https:" && !url.username && !url.password && url.hostname === "shopee.vn" && /^\/product\/\d+\/\d+$/.test(url.pathname);
  } catch { return false; }
}

/** Rank actual expected buyer cashback, never a rounded display badge. No low-rate padding. */
export function pickFlash(deals: Deal[], now = Date.now()): Deal[] {
  const seen = new Set<string>();
  return deals.filter(d => eligible(d, now))
    .sort((a, b) => b.cashback / b.price - a.cashback / a.price || b.cashback - a.cashback || a.id.localeCompare(b.id))
    .filter(d => { const key = d.productUrl; if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, FLASH_COUNT);
}
