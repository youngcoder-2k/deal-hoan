"use client";

import { useState, useEffect } from "react";
import { WarningCircle, ArrowUpRight, X, GoogleChromeLogo } from "@phosphor-icons/react";

const DISMISS_KEY = "deal_hoan_inapp_dismissed_v1";

export default function InAppBrowserGuard() {
  const [inAppInfo, setInAppInfo] = useState<{
    isInApp: boolean;
    appType: "zalo" | "facebook" | "tiktok" | "other";
    appName: string;
    isAndroid: boolean;
    isIOS: boolean;
  } | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (sessionStorage.getItem(DISMISS_KEY)) {
        return;
      }
    } catch {}

    const ua = (window.navigator.userAgent || "").toLowerCase();
    const isZalo = /zalo/i.test(ua);
    const isFb = /fbav|fban|messenger/i.test(ua);
    const isTikTok = /bytelocale|tiktok/i.test(ua);
    const isAndroid = /android/i.test(ua);
    const isIOS = /iphone|ipad|ipod/i.test(ua);

    if (isZalo || isFb || isTikTok) {
      setInAppInfo({
        isInApp: true,
        appType: isZalo ? "zalo" : isFb ? "facebook" : isTikTok ? "tiktok" : "other",
        appName: isZalo ? "Zalo" : isFb ? "Messenger / Facebook" : "TikTok",
        isAndroid,
        isIOS,
      });
      setDismissed(false);
    }
  }, []);

  if (dismissed || !inAppInfo || !inAppInfo.isInApp) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const handleOpenChrome = () => {
    if (typeof window === "undefined") return;
    const cleanUrl = window.location.href.replace(/^https?:\/\//, "");
    // Android Intent URL to open Chrome directly
    window.location.href = `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;end`;
  };

  return (
    <aside
      className="fixed top-0 left-0 right-0 z-[99999] bg-[#1a1f2c] text-white border-b-2 border-[#ee4c23] shadow-2xl px-4 py-3 sm:px-6 transition-all animate-in slide-in-from-top duration-300"
      aria-label="Cảnh báo trình duyệt trong ứng dụng"
    >
      <div className="max-w-4xl mx-auto flex items-start sm:items-center justify-between gap-3">
        {/* Cột trái: Icon & Nội dung */}
        <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-full bg-orange-500/20 text-[#ee4c23] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
            <WarningCircle size={22} weight="fill" />
          </div>

          <div className="flex flex-col gap-0.5 text-xs sm:text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <strong className="text-white font-bold">
                Bạn đang mở qua {inAppInfo.appName}
              </strong>
              <span className="bg-[#ee4c23]/20 text-[#ff7a59] text-[11px] font-semibold px-2 py-0.5 rounded-full border border-[#ee4c23]/30">
                Cần mở trình duyệt ngoài
              </span>
            </div>
            <p className="text-stone-300 leading-snug m-0 text-[11px] sm:text-xs">
              Trình duyệt nội bộ của {inAppInfo.appName} có thể làm rơi cookie hoa hồng Shopee.
              Vui lòng bấm <strong className="text-white bg-white/10 px-1.5 py-0.5 rounded font-mono">···</strong> ở góc trên bên phải → chọn{" "}
              <strong className="text-amber-300 underline underline-offset-2">
                &ldquo;Mở bằng trình duyệt&rdquo; {inAppInfo.isIOS ? "(Safari)" : "(Chrome)"}
              </strong>{" "}
              để đảm bảo 100% được nhận tiền hoàn.
            </p>
          </div>
        </div>

        {/* Cột phải: Nút hành động & Nút tắt */}
        <div className="flex items-center gap-2 shrink-0">
          {inAppInfo.isAndroid && (
            <button
              type="button"
              onClick={handleOpenChrome}
              className="hidden sm:inline-flex items-center gap-1.5 bg-[#ee4c23] hover:bg-[#d9401c] text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition-all"
            >
              <GoogleChromeLogo size={15} weight="bold" />
              <span>Mở Chrome</span>
            </button>
          )}

          <div className="flex items-center gap-1 text-amber-300 font-bold text-xs bg-white/5 border border-white/10 px-2 py-1 rounded-lg">
            <span>Góc trên</span>
            <ArrowUpRight size={14} weight="bold" className="animate-bounce" />
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            title="Đóng thông báo"
            aria-label="Đóng thông báo"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      </div>
    </aside>
  );
}
