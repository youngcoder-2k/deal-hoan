import fs from "fs";
import path from "path";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { DEFAULT_REFERRAL_SETTINGS, type ReferralSettings } from "./types";

const LOCAL_FILE_PATH = path.join(process.cwd(), "data", "referral-settings.json");

let cachedReferralSettings: ReferralSettings = { ...DEFAULT_REFERRAL_SETTINGS };
let lastLoadedAt = 0;
const CACHE_TTL_MS = 15_000;

function clampInt(val: unknown, fallback: number, min: number, max: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

export function normalizeReferralSettings(raw?: Partial<ReferralSettings> | null): ReferralSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_REFERRAL_SETTINGS };
  }
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_REFERRAL_SETTINGS.enabled,
    referrerReward: clampInt(raw.referrerReward, DEFAULT_REFERRAL_SETTINGS.referrerReward, 0, 1_000_000),
    refereeReward: clampInt(raw.refereeReward, DEFAULT_REFERRAL_SETTINGS.refereeReward, 0, 1_000_000),
    referrerMinQualifyingCashback: clampInt(
      raw.referrerMinQualifyingCashback,
      DEFAULT_REFERRAL_SETTINGS.referrerMinQualifyingCashback,
      0,
      50_000_000
    ),
    refereeMinQualifyingCashback: clampInt(
      raw.refereeMinQualifyingCashback,
      DEFAULT_REFERRAL_SETTINGS.refereeMinQualifyingCashback,
      0,
      50_000_000
    ),
    expiryDays: clampInt(raw.expiryDays, DEFAULT_REFERRAL_SETTINGS.expiryDays, 1, 365),
    blockSameDevice:
      typeof raw.blockSameDevice === "boolean"
        ? raw.blockSameDevice
        : DEFAULT_REFERRAL_SETTINGS.blockSameDevice,
    blockSameBankAccount:
      typeof raw.blockSameBankAccount === "boolean"
        ? raw.blockSameBankAccount
        : DEFAULT_REFERRAL_SETTINGS.blockSameBankAccount,
    flagSameIpHours: clampInt(raw.flagSameIpHours, DEFAULT_REFERRAL_SETTINGS.flagSameIpHours, 1, 720),
    maxReferralsPerIp7d: clampInt(
      raw.maxReferralsPerIp7d,
      DEFAULT_REFERRAL_SETTINGS.maxReferralsPerIp7d,
      1,
      100
    ),
    maxAccountAgeDays: clampInt(
      raw.maxAccountAgeDays,
      DEFAULT_REFERRAL_SETTINGS.maxAccountAgeDays,
      0,
      3650
    ),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : undefined,
  };
}

function loadFromLocalFile(): ReferralSettings {
  try {
    if (fs.existsSync(LOCAL_FILE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_FILE_PATH, "utf-8"));
      return normalizeReferralSettings(parsed);
    }
  } catch {
    // Ignore local file read errors
  }
  return { ...DEFAULT_REFERRAL_SETTINGS };
}

function saveToLocalFile(settings: ReferralSettings): void {
  try {
    const dir = path.dirname(LOCAL_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_FILE_PATH, JSON.stringify(settings, null, 2), "utf-8");
  } catch {
    // Ignore read-only filesystem on Vercel serverless
  }
}

export async function getReferralSettings(options: { forceRefresh?: boolean } = {}): Promise<ReferralSettings> {
  const now = Date.now();
  if (!options.forceRefresh && lastLoadedAt > 0 && now - lastLoadedAt < CACHE_TTL_MS) {
    return cachedReferralSettings;
  }

  const db = getSupabaseServiceClient();
  if (db) {
    try {
      const { data, error } = await db
        .from("app_settings")
        .select("settings, updated_at, updated_by")
        .eq("id", "referral_program")
        .maybeSingle();

      if (!error && data?.settings) {
        const merged = normalizeReferralSettings({
          ...(data.settings as Partial<ReferralSettings>),
          updatedAt: data.updated_at || (data.settings as Partial<ReferralSettings>).updatedAt,
          updatedBy: data.updated_by || (data.settings as Partial<ReferralSettings>).updatedBy,
        });
        cachedReferralSettings = merged;
        lastLoadedAt = now;
        return merged;
      }
    } catch {
      // Table might not exist before migration; fall back safely
    }
  }

  const local = loadFromLocalFile();
  cachedReferralSettings = local;
  lastLoadedAt = now;
  return local;
}

export async function updateReferralSettings(
  partial: Partial<ReferralSettings>,
  updatedBy = "admin"
): Promise<ReferralSettings> {
  const current = await getReferralSettings({ forceRefresh: true });
  const next = normalizeReferralSettings({
    ...current,
    ...partial,
    updatedAt: new Date().toISOString(),
    updatedBy,
  });

  const db = getSupabaseServiceClient();
  if (db) {
    try {
      const { error } = await db.from("app_settings").upsert(
        {
          id: "referral_program",
          settings: next,
          updated_by: updatedBy,
          updated_at: next.updatedAt,
        },
        { onConflict: "id" }
      );
      if (error) {
        console.warn("[referral-config] app_settings upsert error:", error.message);
      }
    } catch (err) {
      console.warn("[referral-config] failed to persist to app_settings:", err);
    }
  }

  saveToLocalFile(next);
  cachedReferralSettings = next;
  lastLoadedAt = Date.now();
  return next;
}
