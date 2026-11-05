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

  // Ẩn nút cuộn lên đầu trang (scroll-to-top) và khoá cuộn nền khi modal hướng dẫn mở
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (showIOSGuide) {
      document.body.setAttribute("data-pwa-guide", "open");
      window.dispatchEvent(new CustomEvent("pwa-guide-change"));
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.removeAttribute("data-pwa-guide");
        window.dispatchEvent(new CustomEvent("pwa-guide-change"));
        document.body.style.overflow = prevOverflow;
      };
    } else {
      document.body.removeAttribute("data-pwa-guide");
      window.dispatchEvent(new CustomEvent("pwa-guide-change"));
    }
  }, [showIOSGuide]);

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

      {/* Modal / Sheet hướng dẫn chi tiết trực quan cho iOS Safari & Android */}
      {showIOSGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowIOSGuide(false);
          }}
        >
          <div className="bg-[#18181b] text-white w-full max-w-[390px] rounded-3xl p-4 sm:p-5 shadow-2xl border border-white/15 animate-in slide-in-from-bottom-6 duration-300 max-h-[90vh] overflow-y-auto">
            {/* Thanh kéo trang trí kiểu iOS Sheet */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />

            {/* Header modal */}
            <div className="flex items-center justify-between pb-3.5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl overflow-hidden bg-white shadow-md shrink-0 border border-white/20 p-0.5">
                  <Image
                    src="/icons/icon-192.png"
                    alt="DealHoàn Icon"
                    width={44}
                    height={44}
                    className="object-cover w-full h-full rounded-[14px]"
                  />
                </div>
                <div>
                  <h3 id="pwa-guide-title" className="font-extrabold text-[15px] sm:text-base text-white tracking-tight">
                    {isIOS ? "Thêm DealHoàn vào iPhone" : "Cài DealHoàn ra màn hình"}
                  </h3>
                  <p className="text-[11.5px] text-zinc-400 mt-0.5">
                    {isIOS ? "Chỉ 3 bước đơn giản trên Safari" : "Dùng mượt như App • 1 chạm săn deal"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition-colors cursor-pointer text-sm font-bold"
                aria-label="Đóng hướng dẫn"
              >
                ✕
              </button>
            </div>

            {/* Danh sách các bước trực quan */}
            <div className="space-y-3 my-3.5 text-xs">
              {isIOS ? (
                <>
                  {/* Bước 1: Bấm nút Chia sẻ */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center font-black text-[11px] shrink-0 shadow-sm">
                        1
                      </span>
                      <span className="font-semibold text-zinc-100 text-xs">
                        Chạm biểu tượng <strong>Chia sẻ (Share)</strong> ở thanh dưới Safari:
                      </span>
                    </div>

                    {/* Mô phỏng thanh dưới Safari */}
                    <div className="bg-black/60 rounded-xl px-3 py-2 flex items-center justify-between border border-white/10 shadow-inner">
                      <span className="text-zinc-600 text-base select-none">‹</span>
                      <span className="text-zinc-600 text-base select-none">›</span>
                      
                      {/* Nút Chia sẻ nổi bật với viền sáng & icon chuẩn Apple */}
                      <div className="relative flex items-center gap-1.5 px-3 py-1 rounded-lg bg-orange-500/20 text-orange-300 border border-orange-500/60 shadow-sm ring-2 ring-orange-500/20">
                        <svg className="w-4 h-4 text-orange-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span className="text-[11px] font-bold">Chia sẻ</span>
                      </div>

                      <span className="text-zinc-600 text-xs select-none">📖</span>
                      <span className="text-zinc-600 text-xs select-none">⊡</span>
                    </div>
                  </div>

                  {/* Bước 2: Chọn Thêm vào MH chính */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center font-black text-[11px] shrink-0 shadow-sm">
                        2
                      </span>
                      <span className="font-semibold text-zinc-100 text-xs">
                        Cuộn menu xuống, chọn <strong>&ldquo;Thêm vào MH chính&rdquo;</strong>:
                      </span>
                    </div>

                    {/* Mô phỏng mục menu iOS */}
                    <div className="bg-black/60 rounded-xl px-3 py-2 flex items-center justify-between border border-white/10 shadow-inner">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-zinc-700/90 border border-white/20 flex items-center justify-center text-white shrink-0 shadow-sm">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M12 4v16m8-8H4" />
                          </svg>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-amber-300 block">Thêm vào MH chính</span>
                          <span className="text-[10px] text-zinc-400 block -mt-0.5">Add to Home Screen</span>
                        </div>
                      </div>
                      <span className="text-zinc-400 text-sm font-bold">➕</span>
                    </div>
                  </div>

                  {/* Bước 3: Nhấn nút Thêm ở góc trên */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center font-black text-[11px] shrink-0 shadow-sm">
                        3
                      </span>
                      <span className="font-semibold text-zinc-100 text-xs">
                        Bấm <strong>&ldquo;Thêm&rdquo; (Add)</strong> ở góc trên bên phải:
                      </span>
                    </div>

                    {/* Mô phỏng thanh tiêu đề hộp thoại xác nhận iOS */}
                    <div className="bg-black/60 rounded-xl px-3 py-1.5 flex items-center justify-between border border-white/10 shadow-inner">
                      <span className="text-xs text-zinc-400">Hủy</span>
                      <span className="text-xs font-semibold text-zinc-200">Thêm vào MH chính</span>
                      <span className="px-2.5 py-0.5 bg-blue-500 text-white font-bold text-xs rounded-md shadow-sm">
                        Thêm
                      </span>
                    </div>
                  </div>

                  {/* Gợi ý vị trí trực quan */}
                  <div className="text-[11.5px] text-amber-300/95 font-medium flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
                    <span className="animate-bounce">👇</span> Nút Chia sẻ nằm ở thanh công cụ dưới đáy màn hình
                  </div>
                </>
              ) : (
                <>
                  {/* Android Chrome: Bước 1 */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center font-black text-[11px] shrink-0 shadow-sm">
                        1
                      </span>
                      <span className="font-semibold text-zinc-100 text-xs">
                        Bấm biểu tượng <strong>3 chấm ⋮</strong> ở góc trên bên phải Chrome.
                      </span>
                    </div>
                  </div>

                  {/* Android Chrome: Bước 2 */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center font-black text-[11px] shrink-0 shadow-sm">
                        2
                      </span>
                      <span className="font-semibold text-zinc-100 text-xs">
                        Chọn dòng <strong>&ldquo;Cài đặt ứng dụng&rdquo;</strong> hoặc <strong>&ldquo;Thêm vào Màn hình chính&rdquo;</strong>.
                      </span>
                    </div>
                  </div>

                  {/* Android Chrome: Bước 3 */}
                  <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center font-black text-[11px] shrink-0 shadow-sm">
                        3
                      </span>
                      <span className="font-semibold text-zinc-100 text-xs">
                        Bấm <strong>&ldquo;Cài đặt&rdquo;</strong> để đưa icon DealHoàn ra màn hình.
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer hành động */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleDismiss}
                className="w-full py-3 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:opacity-95 active:scale-[0.98] font-bold text-sm rounded-xl shadow-lg text-white transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Tôi đã hiểu</span>
                <span className="text-base">→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
