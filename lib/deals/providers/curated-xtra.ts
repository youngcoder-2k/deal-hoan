import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import type { Deal, DealProvider } from "../types";
import { pickFlash } from "../select-flash";

const XTRA_FILE_PATH = path.join(process.cwd(), "data", "shopee-xtra-deals.json");

export function getCuratedXtraDeals(): Deal[] {
  try {
    if (fs.existsSync(XTRA_FILE_PATH)) {
      const raw = fs.readFileSync(XTRA_FILE_PATH, "utf-8");
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        return pickFlash(list);
      }
    }
  } catch (err) {
    console.warn("[curated-xtra] failed to read shopee-xtra-deals.json:", err);
  }
  return [];
}

export function saveCuratedXtraDeals(deals: Deal[]): void {
  try {
    const dir = path.dirname(XTRA_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(XTRA_FILE_PATH, JSON.stringify(deals, null, 2), "utf-8");
  } catch (err) {
    console.warn("[curated-xtra] failed to write shopee-xtra-deals.json:", err);
  }
}

export const curatedXtraProvider: DealProvider = {
  id: "shopee", // Use shopee provider label so it displays as Shopee

  isConfigured: () => {
    return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) || getCuratedXtraDeals().length > 0;
  },

  async fetchDeals(): Promise<Deal[]> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const db = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        // Only getDeals owns the cache lifetime; do not cache private PostgREST responses separately.
        global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
      });
      const { data, error } = await db.from("xtra_feed").select("deals,checked_at")
        .eq("id", "current").gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!error && data && Array.isArray(data.deals)) {
        const checkedAt = Date.parse(data.checked_at);
        const selected = pickFlash(data.deals.map(deal => ({ ...deal,
          affiliateOffer: { ...deal.affiliateOffer, checkedAt },
        })));
        console.info("[xtra-feed]", { total: data.deals.length, eligible: selected.length });
        return selected;
      }
      if (error) console.warn("[xtra-feed] read failed", { code: error.code });
    }
    return getCuratedXtraDeals();
  },
};
