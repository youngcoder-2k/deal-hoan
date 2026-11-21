"use client";

export const REF_STORAGE_KEY = "dealhoan_pending_ref_code";
export const DEVICE_ID_STORAGE_KEY = "dealhoan_device_id";
export const FP_STORAGE_KEY = "dealhoan_fp_hash";
export const REF_COOKIE_NAME = "dh_ref";
export const DEVICE_ID_COOKIE_NAME = "dh_did";
export const FP_COOKIE_NAME = "dh_fp";

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  try {
    const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
  } catch {}
}

function getCookie(name: string): string {
  if (typeof document === "undefined") return "";
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

export function clearPendingRefCode() {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(REF_STORAGE_KEY);
    } catch {}
  }
  setCookie(REF_COOKIE_NAME, "", 0);
}

export function savePendingRefCode(code: string) {
  const clean = code.trim().replace(/^@+/, "").slice(0, 64);
  if (!clean) return;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(REF_STORAGE_KEY, clean);
    } catch {}
  }
  setCookie(REF_COOKIE_NAME, clean, 7 * 24 * 60 * 60);
}

export function getPendingRefCode(): string {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(REF_STORAGE_KEY);
      if (stored && stored.trim()) return stored.trim();
    } catch {}
  }
  return getCookie(REF_COOKIE_NAME).trim();
}

function generateDeviceUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `dev_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `dev_${rand.slice(0, 32)}`;
}

/**
 * Lấy hoặc khởi tạo Device ID bền vững trên cả localStorage và Cookie (365 ngày).
 */
export function getOrCreateDeviceId(): string {
  let existing = "";
  if (typeof window !== "undefined") {
    try {
      existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY) || "";
    } catch {}
  }
  if (!existing) {
    existing = getCookie(DEVICE_ID_COOKIE_NAME);
  }
  if (!existing || !/^[a-zA-Z0-9_-]{8,128}$/.test(existing)) {
    existing = generateDeviceUuid();
  }
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, existing);
    } catch {}
  }
  setCookie(DEVICE_ID_COOKIE_NAME, existing, 365 * 24 * 60 * 60);
  return existing;
}

function getWebGLSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return "no-webgl";
    const debugExt = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debugExt) return String(gl.getParameter(gl.RENDERER) || "");
    const vendor = String(gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL) || "");
    const renderer = String(gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) || "");
    return `${vendor}|${renderer}`;
  } catch {
    return "webgl-err";
  }
}

function getCanvasSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-2d";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Be Vietnam Pro', Arial, sans-serif";
    ctx.fillStyle = "#f60";
    ctx.fillRect(10, 4, 80, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("DealHoan-FP-v1 ✓", 6, 12);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("DealHoan-FP-v1 ✓", 8, 14);
    return canvas.toDataURL().slice(-80);
  } catch {
    return "canvas-err";
  }
}

async function sha256Hex(input: string): Promise<string> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const encoded = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest("SHA-256", encoded);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {}
  // Fallback FNV-1a 64-bit style hex if SubtleCrypto unavailable in non-HTTPS localhost edge case
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0") +
    ((h1 ^ h2) >>> 0).toString(16).padStart(8, "0") +
    ((h1 + h2) >>> 0).toString(16).padStart(8, "0")
  );
}

/**
 * Tạo dấu vân tay trình duyệt/thiết bị (Browser Fingerprint SHA-256) ổn định trên cùng thiết bị.
 */
export async function computeBrowserFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "";
  try {
    const cached = sessionStorage.getItem(FP_STORAGE_KEY);
    if (cached && /^[0-9a-f]{16,128}$/.test(cached)) {
      setCookie(FP_COOKIE_NAME, cached, 30 * 24 * 60 * 60);
      return cached;
    }
  } catch {}

  const nav = navigator as Navigator & { deviceMemory?: number };
  const tz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return "";
    }
  })();

  const rawSignals = [
    nav.platform || "",
    nav.language || "",
    Array.isArray(nav.languages) ? nav.languages.join(",") : "",
    String(nav.hardwareConcurrency || 0),
    String(nav.deviceMemory || 0),
    String(nav.maxTouchPoints || 0),
    `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
    String(Math.round((window.devicePixelRatio || 1) * 100)),
    tz,
    String(new Date().getTimezoneOffset()),
    getWebGLSignature(),
    getCanvasSignature(),
  ].join("||");

  const fp = await sha256Hex(rawSignals);
  try {
    sessionStorage.setItem(FP_STORAGE_KEY, fp);
  } catch {}
  setCookie(FP_COOKIE_NAME, fp, 30 * 24 * 60 * 60);
  return fp;
}

export async function collectDeviceIdentity(): Promise<{
  deviceId: string;
  fingerprintHash: string;
}> {
  const deviceId = getOrCreateDeviceId();
  const fingerprintHash = await computeBrowserFingerprint();
  return { deviceId, fingerprintHash };
}
