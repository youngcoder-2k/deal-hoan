"use client";

import React, { useState, useEffect } from "react";

export default function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    let ticking = false;

    const checkGuideOpen = () => {
      if (typeof document === "undefined") return false;
      const open = document.body.getAttribute("data-pwa-guide") === "open";
      setIsGuideOpen(open);
      return open;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const guideOpen = checkGuideOpen();
          setIsVisible(window.scrollY > 300 && !guideOpen);
          ticking = false;
        });
        ticking = true;
      }
    };

    // Theo dõi thuộc tính data-pwa-guide trên <body> để ẩn ngay khi modal mở
    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
      observer = new MutationObserver(() => {
        checkGuideOpen();
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ["data-pwa-guide"] });
    }

    const handleGuideEvent = () => checkGuideOpen();
    window.addEventListener("pwa-guide-change", handleGuideEvent);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pwa-guide-change", handleGuideEvent);
      if (observer) observer.disconnect();
    };
  }, []);

  const scrollToTop = () => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  // Không hiển thị nếu modal hướng dẫn cài đặt đang mở
  if (isGuideOpen) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className={`scroll-to-top ${isVisible ? "visible" : ""}`}
      aria-label="Cuộn lên đầu trang"
      title="Cuộn lên đầu trang"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="scroll-icon"
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  );
}
