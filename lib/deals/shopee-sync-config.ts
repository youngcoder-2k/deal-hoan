import fs from "fs";
import path from "path";

export interface ShopeeSyncConfig {
  shopeeCookie: string;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
  lastSyncAt: string | null;
  lastSyncResult: string | null;
  lastOrdersCount: number;
  updatedAt: string;
}

const DEFAULT_CONFIG: ShopeeSyncConfig = {
  shopeeCookie: process.env.SHOPEE_AFFILIATE_COOKIE || "",
  autoSyncEnabled: true,
  syncIntervalMinutes: 15,
  lastSyncAt: null,
  lastSyncResult: null,
  lastOrdersCount: 0,
  updatedAt: new Date().toISOString(),
};

const CONFIG_FILE_PATH = path.join(process.cwd(), "data", "shopee-sync-config.json");

export function getShopeeSyncConfig(): ShopeeSyncConfig {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const raw = fs.readFileSync(CONFIG_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        shopeeCookie: parsed.shopeeCookie || process.env.SHOPEE_AFFILIATE_COOKIE || "",
      };
    }
  } catch (err) {
    console.warn("Failed to read shopee-sync-config.json:", err);
  }
  return {
    ...DEFAULT_CONFIG,
    shopeeCookie: process.env.SHOPEE_AFFILIATE_COOKIE || "",
  };
}

export function saveShopeeSyncConfig(update: Partial<ShopeeSyncConfig>): ShopeeSyncConfig {
  const current = getShopeeSyncConfig();
  const updated: ShopeeSyncConfig = {
    ...current,
    ...update,
    updatedAt: new Date().toISOString(),
  };

  try {
    const dir = path.dirname(CONFIG_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(updated, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write shopee-sync-config.json:", err);
  }

  return updated;
}
