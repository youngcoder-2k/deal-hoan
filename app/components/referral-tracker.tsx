"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  clearPendingRefCode,
  collectDeviceIdentity,
  getPendingRefCode,
  savePendingRefCode,
} from "@/lib/referral/device-fingerprint";

interface ReferralBannerState {
  tone: "invite" | "success";
  text: string;
}

export default function ReferralTracker() {
  const runningRef = useRef(false);
  const [banner, setBanner] = useState<ReferralBannerState | null>(null);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 7000);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let landedWithInvite = false;
    let initialBanner: ReferralBannerState | null = null;
    let initTimer: ReturnType<typeof setTimeout> | null = null;

    // 1. Bắt mã giới thiệu (?ref=...) hoặc thông báo vừa nhận thưởng từ OAuth callback (?ref_claimed=1)
    try {
      const url = new URL(window.location.href);
      const refParam = url.searchParams.get("ref") || url.searchParams.get("invite");
      const refClaimed = url.searchParams.get("ref_claimed");
      const refReward = Number(url.searchParams.get("ref_reward") || 0);
      let urlChanged = false;

      if (refParam && refParam.trim()) {
        savePendingRefCode(refParam.trim());
        landedWithInvite = true;
        url.searchParams.delete("ref");
        url.searchParams.delete("invite");
        urlChanged = true;
      }

      if (refClaimed === "1") {
        clearPendingRefCode();
        const rewardLabel =
          Number.isFinite(refReward) && refReward > 0
            ? `${Math.round(refReward).toLocaleString("vi-VN")}đ`
            : "10.000đ";
        initialBanner = {
          tone: "success",
          text: `Áp dụng mã giới thiệu thành công! Bạn vừa nhận +${rewardLabel} vào số dư Đang khóa.`,
        };
        url.searchParams.delete("ref_claimed");
        url.searchParams.delete("ref_reward");
        urlChanged = true;
      }

      if (urlChanged) {
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
    } catch {}

    if (initialBanner) {
      const bannerToShow = initialBanner;
      initTimer = setTimeout(() => setBanner(bannerToShow), 0);
    }

    // 2. Luôn chuẩn bị sẵn Device ID & Browser Fingerprint cookie ngay cả trước khi đăng nhập Google
    let identityPromise = collectDeviceIdentity().catch(() => ({
      deviceId: "",
      fingerprintHash: "",
    }));

    const syncForUser = async (userId: string) => {
      if (!userId || runningRef.current) return;
      runningRef.current = true;
      try {
        const { deviceId, fingerprintHash } = await identityPromise;

        // Gửi tín hiệu thiết bị 1 lần mỗi phiên đăng nhập để phục vụ chống trùng máy
        const signalKey = `dh_sig_sent_${userId}`;
        let alreadySent = false;
        try {
          alreadySent = sessionStorage.getItem(signalKey) === "1";
        } catch {}

        if (!alreadySent && (deviceId || fingerprintHash)) {
          const sigRes = await fetch("/api/referral/signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId, fingerprintHash }),
          }).catch(() => null);
          if (sigRes?.ok) {
            try {
              sessionStorage.setItem(signalKey, "1");
            } catch {}
          }
        }

        // Nếu có mã giới thiệu đang chờ -> tự động gắn cho user mới sau khi đăng nhập
        const pendingRef = getPendingRefCode();
        if (pendingRef) {
          const claimRes = await fetch("/api/referral/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              refCode: pendingRef,
              deviceId,
              fingerprintHash,
            }),
          }).catch(() => null);

          if (claimRes) {
            const payload = await claimRes.json().catch(() => null);
            if (claimRes.ok && payload?.success) {
              clearPendingRefCode();
              setBanner({
                tone: "success",
                text:
                  payload.message ||
                  "Áp dụng mã giới thiệu thành công! Thưởng đã được cộng vào số dư Đang khóa.",
              });
            } else if (
              claimRes.status === 400 &&
              payload?.code !== "referrer_not_found" &&
              payload?.code !== "missing_device_signal"
            ) {
              clearPendingRefCode();
            }
          }
        }
      } finally {
        runningRef.current = false;
      }
    };

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      if (landedWithInvite && !initialBanner) {
        initTimer = setTimeout(
          () =>
            setBanner({
              tone: "invite",
              text: "Đã lưu mã giới thiệu từ bạn bè! Đăng nhập để nhận thưởng chào mừng vào ví Đang khóa.",
            }),
          0
        );
      }
      return () => {
        if (initTimer) clearTimeout(initTimer);
      };
    }

    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data?.user?.id) {
        void syncForUser(data.user.id);
      } else if (landedWithInvite && !initialBanner) {
        setBanner({
          tone: "invite",
          text: "Bạn nhận được lời mời tham gia DealHoàn! Đăng nhập để nhận ngay thưởng chào mừng vào ví Đang khóa.",
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session?.user?.id) {
        identityPromise = collectDeviceIdentity().catch(() => ({
          deviceId: "",
          fingerprintHash: "",
        }));
        void syncForUser(session.user.id);
      }
    });

    return () => {
      active = false;
      if (initTimer) clearTimeout(initTimer);
      subscription.unsubscribe();
    };
  }, []);

  if (!banner) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 250,
        maxWidth: "min(460px, calc(100vw - 24px))",
        width: "max-content",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 14px",
        borderRadius: 12,
        background: banner.tone === "success" ? "#ecfdf5" : "#fff7ed",
        border: `1px solid ${banner.tone === "success" ? "#86efac" : "#fdba74"}`,
        color: banner.tone === "success" ? "#065f46" : "#9a3412",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.14)",
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.45,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 16, flexShrink: 0 }}>
        {banner.tone === "success" ? "🎉" : "🎁"}
      </span>
      <span style={{ flex: 1 }}>{banner.text}</span>
      <button
        type="button"
        onClick={() => setBanner(null)}
        aria-label="Đóng thông báo giới thiệu"
        style={{
          border: 0,
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: "2px 4px",
          opacity: 0.75,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
