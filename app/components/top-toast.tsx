"use client";

import React, { useEffect, useRef, useState } from "react";

export interface ToastData {
  id?: string | number;
  type?: "error" | "warning" | "success" | "info";
  title?: string;
  message: string;
  duration?: number;
}

interface TopToastProps {
  toast: ToastData | null;
  onClose: () => void;
}

export default function TopToast({ toast, onClose }: TopToastProps) {
  const [isClosing, setIsClosing] = useState(false);

  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    setIsClosing(false);
    if (!toast) return;
    const duration = Math.min(3750, Math.max(3000, toast.duration ?? 3500));
    const timer = setTimeout(() => setIsClosing(true), duration);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!isClosing) return;
    const timer = setTimeout(() => closeRef.current(), 250);
    return () => clearTimeout(timer);
  }, [isClosing]);

  if (!toast) return null;
  const handleClose = () => setIsClosing(true);

  const type = toast.type || "error";
  const isError = type === "error";
  const isWarning = type === "warning";
  const isSuccess = type === "success";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`top-toast-container w-[92vw] max-w-md pointer-events-auto ${
        isClosing ? "top-toast-exit" : "top-toast-enter"
      }`}
    >
      <div
        className={`flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl shadow-2xl backdrop-blur-md border ${
          isError
            ? "bg-[#18181b]/95 border-rose-500/40 text-white shadow-rose-950/40"
            : isWarning
            ? "bg-[#18181b]/95 border-amber-500/40 text-white shadow-amber-950/40"
            : isSuccess
            ? "bg-[#18181b]/95 border-emerald-500/40 text-white shadow-emerald-950/40"
            : "bg-[#18181b]/95 border-blue-500/40 text-white shadow-blue-950/40"
        }`}
      >
        {/* Icon */}
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
            isError
              ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
              : isWarning
              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
              : isSuccess
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              : "bg-blue-500/20 text-blue-400 border-blue-500/30"
          }`}
        >
          {isError && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 7.5h.008v.008H12v-.008z"
              />
            </svg>
          )}
          {isWarning && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          )}
          {isSuccess && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-1">
          {toast.title && (
            <h4
              className={`font-black text-sm tracking-tight mb-0.5 ${
                isError ? "text-rose-400" : isWarning ? "text-amber-400" : "text-emerald-400"
              }`}
            >
              {toast.title}
            </h4>
          )}
          <p className="text-xs sm:text-[13px] text-zinc-200 leading-relaxed font-medium">
            {toast.message}
          </p>
        </div>

        {/* Close Button */}
        <button
          onClick={handleClose}
          type="button"
          aria-label="Đóng thông báo"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
