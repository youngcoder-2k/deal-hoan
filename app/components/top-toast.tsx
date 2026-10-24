"use client";

import React, { useEffect, useRef, useState } from "react";
import { createToastTimer } from "@/lib/ui/toast-timer";
import styles from "./top-toast.module.css";

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

  const timerRef = useRef<ReturnType<typeof createToastTimer> | null>(null);
  const pointerHeld = useRef(false);
  const focusHeld = useRef(false);
  const [isPaused, setIsPaused] = useState(false);
  useEffect(() => {
    setIsClosing(false);
    pointerHeld.current = false;
    focusHeld.current = false;
    setIsPaused(false);
    if (!toast) return;
    const timer = createToastTimer(setIsClosing, () => closeRef.current(), Math.min(3750, Math.max(3000, toast.duration ?? 3500)));
    timerRef.current = timer;
    timer.resume();
    return () => { timer.dispose(); timerRef.current = null; };
  }, [toast]);
  const syncPause = () => {
    const paused = pointerHeld.current || focusHeld.current;
    setIsPaused(paused);
    if (paused) timerRef.current?.pause();
    else timerRef.current?.resume();
  };
  if (!toast) return null;
  const handleClose = () => timerRef.current?.dismiss();

  const type = toast.type || "error";
  const isError = type === "error";
  const isWarning = type === "warning";
  const isSuccess = type === "success";

  return (
    <div
      role="alert"
      aria-live="assertive"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("button")) return;
        pointerHeld.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        syncPause();
      }}
      onPointerUp={() => { pointerHeld.current = false; syncPause(); }}
      onPointerCancel={() => { pointerHeld.current = false; syncPause(); }}
      onLostPointerCapture={() => { pointerHeld.current = false; syncPause(); }}
      onFocusCapture={() => { focusHeld.current = true; syncPause(); }}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { focusHeld.current = false; syncPause(); } }}
      className={`top-toast-container ${styles.container} ${isClosing ? "top-toast-exit" : "top-toast-enter"}`}
    >
      <div className={styles.surface}>
        {/* Icon */}
        <div
          className={styles.icon}
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

        <p className={styles.message}>{toast.message}</p>

        {/* Close Button */}
        <button
          onClick={handleClose}
          type="button"
          aria-label="Đóng thông báo"
          className={styles.close}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <span key={toast.id ?? toast.message} aria-hidden="true" className={styles.progress} style={{ animationDuration: `${Math.min(3750, Math.max(3000, toast.duration ?? 3500))}ms`, animationPlayState: isPaused ? "paused" : "running" }} />
      </div>
    </div>
  );
}
