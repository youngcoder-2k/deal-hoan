"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "deal_hoan_pwa_dismissed_v1";
const DISMISS_DAYS = 7;

export default function PwaInstallPrompt() {
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS] = useState(() => {
    if (typeof window === "undefined") return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return (
      /iphone|ipad|ipod/.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
    );
  });
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // 1. Kiểm tra môi trường trình duyệt
    if (typeof window === "undefined") return;

    // 2. Nếu đã mở dưới dạng App Standalone (đã cài rồi) => Không hiện
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes("android-app://");

    if (isStandalone) return;

    // 3. Kiểm tra xem người dùng đã bấm tắt gần đây chưa (trong vòng 7 ngày)
    const dismissedTime = localStorage.getItem(DISMISS_KEY);
    if (dismissedTime) {
      const diffMs = Date.now() - parseInt(dismissedTime, 10);
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays < DISMISS_DAYS) {
        return;
      }
    }

    // 4. Nhận diện iOS (iPhone / iPad)
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

    // 5. Với Android / Desktop Chrome: Bắt sự kiện beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Đợi 5 giây sau khi vào trang mới hiển thị để không làm phiền trải nghiệm lướt deal
      setTimeout(() => {
        setIsVisible(true);
      }, 5000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Với iOS (Safari không có beforeinstallprompt): Đợi 6 giây rồi hiển thị
    let iosTimer: NodeJS.Timeout | null = null;
    if (isIOSDevice) {
      iosTimer = setTimeout(() => {
        setIsVisible(true);
      }, 6000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setShowIOSGuide(false);
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch {
      // Ignore storage errors
    }
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setIsVisible(false);
        }
      } catch (err) {
        console.debug("[PWA] Install prompt error:", err);
      } finally {
        setDeferredPrompt(null);
      }
    } else {
      // Fallback nếu trình duyệt không hỗ trợ prompt trực tiếp
      setShowIOSGuide(true);
    }
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Floating Install Banner ở góc dưới */}
      <div className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:w-[400px] z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
        <div className="bg-[#18181b]/95 text-white backdrop-blur-md rounded-2xl p-3.5 shadow-2xl border border-white/10 flex items-center gap-3">
          {/* Logo App */}
          <div className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-md bg-white border border-white/20">
            <Image
              src="/icons/icon-192.png"
              alt="DealHoàn App Icon"
              width={48}
              height={48}
              className="object-cover w-full h-full"
            />
          </div>

          {/* Nội dung mời gọi */}
          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight truncate text-white">
                Cài đặt DealHoàn
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                App
              </span>
            </div>
            <p className="text-xs text-zinc-300 truncate mt-0.5">
              {isIOS ? "Thêm vào màn hình • Săn deal 1 chạm" : "Mở nhanh như app • Nhận hoàn tiền"}
            </p>
          </div>

          {/* Nút hành động */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleInstallClick}
              className="px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer whitespace-nowrap"
            >
              {isIOS ? "Cài đặt" : "Cài ngay"}
            </button>
            <button
              onClick={handleDismiss}
              aria-label="Đóng thông báo"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Modal / Sheet hướng dẫn chi tiết cho iOS Safari */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[#1c1917] text-white w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-white/15 animate-in slide-in-from-bottom-6 duration-300">
            {/* Header modal */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-white shadow-xs shrink-0">
                  <Image
                    src="/icons/icon-192.png"
                    alt="DealHoàn Icon"
                    width={40}
                    height={40}
                    className="object-cover w-full h-full"
                  />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Thêm DealHoàn vào iPhone</h3>
                  <p className="text-[11px] text-zinc-400">Chỉ 2 bước đơn giản trên Safari</p>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 text-zinc-300 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Các bước hướng dẫn */}
            <div className="space-y-3.5 my-4 text-xs">
              <div className="flex items-start gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/5">
                <div className="w-7 h-7 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center font-black shrink-0 text-xs">
                  1
                </div>
                <div className="flex-1 leading-relaxed text-zinc-200">
                  Bấm vào biểu tượng <strong>Chia sẻ (Share)</strong>{" "}
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/15 text-white font-bold align-middle mx-1">
                    <svg className="w-3.5 h-3.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </span>{" "}
                  ở thanh công cụ dưới đáy Safari.
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/5">
                <div className="w-7 h-7 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center font-black shrink-0 text-xs">
                  2
                </div>
                <div className="flex-1 leading-relaxed text-zinc-200">
                  Cuộn xuống và chọn dòng{" "}
                  <strong className="text-amber-300">&ldquo;Thêm vào MH chính&rdquo;</strong> (Add to Home Screen ➕), sau đó bấm <strong>&ldquo;Thêm&rdquo;</strong> ở góc trên bên phải.
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={handleDismiss}
                className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 active:scale-98 font-bold text-xs rounded-xl shadow-md text-white transition-all cursor-pointer"
              >
                Tôi đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
