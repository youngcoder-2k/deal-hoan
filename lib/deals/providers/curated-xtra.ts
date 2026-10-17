import fs from "fs";
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
    const deals = getCuratedXtraDeals();
    return deals.length > 0;
  },

  async fetchDeals(): Promise<Deal[]> {
    return getCuratedXtraDeals();
  },
};
