"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import type { User } from "@supabase/supabase-js";
import AccountModal from "@/app/components/account-modal";
import { isAdminUser } from "@/lib/auth/admin";
import { formatPrice, formatSold } from "@/lib/deals/format";
import type { Deal, DealBundle, Coupon, CouponCategory, Platform } from "@/lib/deals/types";
import { getDailyShopeeCoupons } from "@/lib/deals/coupons-static";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  buildShopeeAffiliateUrl,
  isShopeeUrl,
  buildCustomShortUrl,
  extractUrlFromText,
} from "@/lib/deals/affiliate";
import { cashbackFor } from "@/lib/deals/score";
import { resolveProductLocally, matchProductFromCatalog, SAMPLE_CHIP_PRODUCTS, type CalculatedProduct } from "@/lib/deals/resolve";

/**
 * Tabs over "Deal hot hôm nay". Every sort is backed by a field the marketplace
 * actually reports, so no tab implies data we do not have.
 */
/**
 * The card grids must never imply a marketplace they did not come from, so the
 * live source is stated next to them.
 */
const SOURCE_NOTE: Record<DealBundle["source"], string> = {
  shopee: "Dữ liệu thật từ Shopee Affiliate API · cập nhật mỗi 15 phút.",
  "shopee-scrape":
    "Dữ liệu thật cào trực tiếp từ Shopee (phiên đăng nhập cục bộ) · hoàn tiền là ước tính, chưa gắn link affiliate thật.",
  accesstrade:
    "Dữ liệu thật từ AccessTrade (Shopee · Lazada · TikTok Shop) · cập nhật mỗi 15 phút.",
  lazada:
    "Dữ liệu thật từ Lazada · cập nhật mỗi 15 phút. Chưa cắm khoá Shopee Affiliate.",
  seed: "Đang hiển thị dữ liệu mẫu — chưa cắm khoá API của sàn nào.",
};

const HOT_TABS = [
  "Tất cả",
  "Cashback cao",
  "Giảm sâu",
  "Đánh giá cao",
  "Đang được săn",
] as const;

const HOT_SORTERS: ((a: Deal, b: Deal) => number)[] = [
  (a, b) => b.dealScore - a.dealScore,
  (a, b) => b.cashback - a.cashback,
  (a, b) => b.discountPercent - a.discountPercent,
  (a, b) => b.ratingAverage - a.ratingAverage || b.reviewCount - a.reviewCount,
  (a, b) => (b.sold ?? 0) - (a.sold ?? 0),
];

const COUPON_TABS: { key: CouponCategory; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "social", label: "Mạng xã hội" },
  { key: "freeship", label: "Freeship" },
  { key: "mall", label: "Shopee Mall" },
  { key: "vip", label: "Shopee VIP" },
];

function getCardLogoAndTheme(c: Coupon) {
  const cat = c.category;
  if (cat === "facebook" || c.socialType === "facebook") {
    return {
      cardClass: "fb-card",
      logoClass: "fb",
      tag: c.badge || "ĐỘC QUYỀN",
      svg: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 8h3V4.5c-.5-.1-2-.2-3.4-.2-3.3 0-5.6 2-5.6 5.7V13H4v4h4v7h5v-7h3.4l.6-4H13V10.4C13 9.2 13.4 8 14 8z" />
        </svg>
      ),
    };
  }
  if (cat === "instagram" || c.socialType === "instagram") {
    return {
      cardClass: "ig-card",
      logoClass: "ig",
      tag: c.badge || "ĐỘC QUYỀN",
      svg: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      ),
    };
  }
  if (cat === "youtube" || c.socialType === "youtube") {
    return {
      cardClass: "yt-card",
      logoClass: "yt",
      tag: c.badge || "ĐỘC QUYỀN",
      svg: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M22 12s0-3.4-.4-5c-.2-1-1-1.8-2-2C18 4.5 12 4.5 12 4.5S6 4.5 4.4 5c-1 .2-1.8 1-2 2C2 8.6 2 12 2 12s0 3.4.4 5c.2 1 1 1.8 2 2 1.6.5 7.6.5 7.6.5s6 0 7.6-.5c1-.2 1.8-1 2-2 .4-1.6.4-5 .4-5zM10 15.5v-7l6 3.5-6 3.5z" />
        </svg>
      ),
    };
  }
  if (cat === "freeship") {
    return {
      cardClass: "ship-card",
      logoClass: "ship",
      tag: c.badge || "TOÀN SÀN",
      svg: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h11v10H3z" />
          <path d="M14 10h4l3 3v3h-7z" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
      ),
    };
  }
  if (cat === "mall") {
    return {
      cardClass: "mall-card",
      logoClass: "mall",
      tag: c.badge || "SHOPEE MALL",
      svg: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 8h12l-1 12H7L6 8z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      ),
    };
  }
  if (cat === "vip") {
    return {
      cardClass: "vip-card",
      logoClass: "vip",
      tag: c.badge || "THÀNH VIÊN",
      svg: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 8l4 3 5-6 5 6 4-3-2 11H5L3 8z" />
        </svg>
      ),
    };
  }
  return {
    cardClass: "ship-card",
    logoClass: "ship",
    tag: c.badge || "TOÀN SÀN",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h11v10H3z" />
        <path d="M14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </svg>
    ),
  };
}

function LazadaLogo({ color = "#0F4C81" }: { color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20.2C6.8 16 4.4 13.2 4.4 10.2A4 4 0 0 1 12 8.4a4 4 0 0 1 7.6 1.8c0 3-2.4 5.8-7.6 10Z"
        fill={color}
      />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="deal-fav-icon"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? "1.5" : "2"}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function Receipt({
  platform = "Shopee Mall",
  product,
  trackedLink,
  copied,
  onCopy,
  onBuy,
  onClear,
}: {
  platform?: string;
  product?: CalculatedProduct | null;
  trackedLink?: string;
  copied?: boolean;
  onCopy?: () => void;
  onBuy?: () => void;
  onClear?: () => void;
}) {
  const price = product?.price ?? 1540000;
  const originalPrice = product?.originalPrice ?? 1990000;
  const cashback = product?.cashback ?? 77000;
  const actualCost = price - cashback;
  const savingsPercent =
    product?.savingsPercent ??
    (price > 0 ? Math.round((cashback / price) * 100) : 5);
  const productName = product?.name || "Tai nghe Bluetooth chống ồn Sony WF-C710N";
  const productImg = product?.imageUrl || "/demo/sony-wf-c710n.jpg";
  const displayPlatform = product?.platform || platform;

  return (
    <div className="receipt">
      <div className="receipt-head">
        <b>⚡ Hoàn tiền cho link của bạn</b>
        <span>{displayPlatform}</span>
      </div>
      <div className="receipt-product">
        <div className="placeholder small">
          {productImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={productImg}
              alt={productName}
              className="deal-image"
              loading="lazy"
            />
          ) : (
            "ảnh SP"
          )}
        </div>
        <div>
          <b>{productName}</b>
          <p>
            {displayPlatform} {product?.seller ? `· ${product.seller}` : ""} ·{" "}
            <em className="green">
              Hoàn đến {price > 0 ? ((cashback / price) * 100).toFixed(0) : "5"}%
            </em>
          </p>
        </div>
      </div>
      <div className="price-lines">
        {originalPrice > price && (
          <div>
            <span>Giá niêm yết</span>
            <s>{formatPrice(originalPrice)}</s>
          </div>
        )}
        <hr />
        <div className="total">
          <b>Thanh toán hôm nay</b>
          <strong>{formatPrice(price)}</strong>
        </div>
        <div>
          <span>
            {product?.isExactCashback ? "Hoàn tiền đến" : "Hoàn về ví"}{" "}
            <b className="green">sau 14–15 ngày</b>
          </span>
          <b className="green">+{formatPrice(cashback)}</b>
        </div>
        <div className="actual-cost">
          <b>Chi phí thực sau khi nhận hoàn</b>
          <span>
            <strong>{formatPrice(actualCost)}</strong>
            <em>tiết kiệm {savingsPercent}%</em>
          </span>
        </div>
      </div>
      {trackedLink && (
        <div className="tracked-link">
          <span>
            <small>Link mới</small>
            <a
              href={trackedLink}
              target="_blank"
              rel="noopener noreferrer"
              className="tracked-url"
              title="Nhấp để mở link hoặc bấm Copy link"
            >
              <b>{trackedLink}</b>
            </a>
          </span>
          <button className={copied ? "is-copied" : ""} onClick={onCopy}>
            {copied ? "✓ Đã copy" : "Copy link"}
          </button>
        </div>
      )}
      <button className="primary wide" onClick={onBuy}>
        Mua ngay &amp; Nhận hoàn tiền →
      </button>
      {onClear && (
        <div className="receipt-foot">
          <span>
            Mua qua link mới hoặc nút trên — ghi nhận trong 24 giờ, nhận hoàn
            sau 14–15 ngày · <a href="#how">điều kiện</a>
          </span>
          <button className="result-reset" onClick={onClear}>Tính link khác</button>
        </div>
      )}
    </div>
  );
}

function DemoReceipt() {
  return (
    <div className="demo-receipt" aria-label="Minh hoạ cách tính hoàn tiền">
      <div className="demo-receipt-head">
        <b>Bạn thực trả bao nhiêu?</b>
        <span>🔥 Deal Score 94</span>
      </div>
      <div className="demo-receipt-product">
        <div className="placeholder demo-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/demo/sony-wf-c710n.jpg"
            alt="Tai nghe Bluetooth chống ồn Sony WF-C710N"
            className="deal-image"
            loading="lazy"
          />
        </div>
        <div>
          <b>Tai nghe Bluetooth chống ồn Sony WF-C710N</b>
          <p>
            Shopee Mall · <em>còn 6 giờ</em>
          </p>
        </div>
      </div>
      <div className="demo-price-lines">
        <div>
          <span>Giá niêm yết</span>
          <s>1.990.000đ</s>
        </div>
        <div>
          <span>Giảm giá sàn</span>
          <b>−400.000đ</b>
        </div>
        <div>
          <span>
            Mã <code>DEALHOAN50</code>
          </span>
          <b>−50.000đ</b>
        </div>
        <hr />
        <div className="demo-total">
          <b>Thanh toán hôm nay</b>
          <strong>1.540.000đ</strong>
        </div>
        <div>
          <span>
            Hoàn về ví <b>sau 14–15 ngày</b>
          </span>
          <b className="green">+77.000đ</b>
        </div>
      </div>
      <div className="demo-actual-cost">
        <b>Chi phí thực sau khi nhận hoàn</b>
        <span>
          <strong>1.463.000đ</strong>
          <em>tiết kiệm 26%</em>
        </span>
      </div>
      <div className="primary demo-btn" aria-hidden="true">
        Mua ngay &amp; Nhận hoàn tiền →
      </div>
      <p className="demo-receipt-foot">
        Ghi nhận trong 24 giờ · nhận hoàn sau 14–15 ngày · điều kiện
      </p>
    </div>
  );
}
function getNextShopeeSlotEndMs(): number {
  const now = new Date();
  const vnTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const vnHour = vnTime.getHours();

  // Các mốc chuyển khung giờ Flash Sale của Shopee: 2, 9, 12, 15, 17, 21, 24 (0h)
  const slotHours = [2, 9, 12, 15, 17, 21, 24];
  const nextHour = slotHours.find((h) => h > vnHour) ?? 24;

  const target = new Date(vnTime);
  target.setHours(nextHour, 0, 0, 0);

  const diffMs = target.getTime() - vnTime.getTime();
  return Date.now() + diffMs;
}

export default function HomeClient({
  flashDeals,
  hotDeals,
  vouchers: initialVouchers,
  source,
  flashEndTime,
  flashSlot,
}: {
  flashDeals: Deal[];
  hotDeals: Deal[];
  vouchers?: Coupon[];
  source: DealBundle["source"];
  flashEndTime?: number;
  flashSlot?: string;
}) {
  const linkInputRef = useRef<HTMLInputElement>(null);
  const flashScrollRef = useRef<HTMLDivElement>(null);
  const isFlashHoveredRef = useRef(false);
  const flashPauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const pauseFlash = (ms = 6000) => {
    isFlashHoveredRef.current = true;
    if (flashPauseTimeoutRef.current) clearTimeout(flashPauseTimeoutRef.current);
    flashPauseTimeoutRef.current = setTimeout(() => {
      isFlashHoveredRef.current = false;
    }, ms);
  };
  const [link, setLink] = useState("");
  const [result, setResult] = useState("");
  const [resultClosing, setResultClosing] = useState(false);
  const [savedDealIds, setSavedDealIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("dealhoan_favorite_deal_ids");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed.map(String);
      }
    } catch {}
    return [];
  });
  const [tab, setTab] = useState(0);
  const [couponTab, setCouponTab] = useState<CouponCategory>("all");
  const [showAllCoupons, setShowAllCoupons] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const allCoupons = useMemo(() => {
    const fallback = getDailyShopeeCoupons();
    if (!initialVouchers || initialVouchers.length === 0) return fallback;
    const hasSocial = initialVouchers.some(
      (c) => c.category === "facebook" || c.socialType === "facebook",
    );
    if (!hasSocial) {
      const fallbackIds = new Set(fallback.map((c) => c.id));
      const extra = initialVouchers.filter((c) => !fallbackIds.has(c.id));
      return [...fallback, ...extra];
    }
    return initialVouchers;
  }, [initialVouchers]);

  const displayedCoupons =
    couponTab === "all"
      ? allCoupons
      : couponTab === "social"
      ? allCoupons.filter(
          (c) =>
            c.category === "facebook" ||
            c.category === "instagram" ||
            c.category === "youtube" ||
            c.category === "social",
        )
      : allCoupons.filter((c) => c.category === couponTab);


  const [seconds, setSeconds] = useState(() => {
    const endMs = flashEndTime && flashEndTime > Date.now() ? flashEndTime : getNextShopeeSlotEndMs();

    return Math.max(0, Math.floor((endMs - Date.now()) / 1000));
  });
  const [busy, setBusy] = useState(false);
  const [calcPercent, setCalcPercent] = useState(1);
  const [inputError, setInputError] = useState(false);
  const [refCopied, setRefCopied] = useState(false);
  const [trackedLink, setTrackedLink] = useState("");
  const [copiedTracked, setCopiedTracked] = useState(false);
  const [calculatedProduct, setCalculatedProduct] = useState<CalculatedProduct | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyDontShow, setBuyDontShow] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);

  const fetchUserBalance = () => {
    fetch("/api/wallet")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.wallet && typeof data.wallet.balance === "number") {
          setUserBalance(data.wallet.balance);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    fetch("/api/wallet")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data?.wallet && typeof data.wallet.balance === "number") {
          setUserBalance(data.wallet.balance);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!busy) {
      setCalcPercent(1);
      return;
    }
    setCalcPercent(1);
    const interval = setInterval(() => {
      setCalcPercent((prev) => {
        if (prev >= 95) return prev;
        if (prev < 35) return prev + Math.floor(Math.random() * 4 + 3);
        if (prev < 70) return prev + Math.floor(Math.random() * 3 + 2);
        if (prev < 88) return prev + 1;
        return Math.min(95, prev + (Math.random() > 0.6 ? 1 : 0));
      });
    }, 45);
    return () => {
      clearInterval(interval);
    };
  }, [busy]);

  useEffect(() => {
    const tick = () => {
      const endMs = flashEndTime && flashEndTime > Date.now() ? flashEndTime : getNextShopeeSlotEndMs();
      setSeconds(Math.max(0, Math.floor((endMs - Date.now()) / 1000)));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [flashEndTime]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (isFlashHoveredRef.current) return;
      const el = flashScrollRef.current;
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max > 0)
        el.scrollTo({
          left:
            el.scrollLeft >= max - 10 ? 0 : Math.min(el.scrollLeft + 246, max),
          behavior: "smooth",
        });
    }, 3000);
    return () => {
      clearInterval(timer);
      if (flashPauseTimeoutRef.current) clearTimeout(flashPauseTimeoutRef.current);
    };
  }, []);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const notify = (m: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(m);
    toastTimeoutRef.current = setTimeout(() => setToast(""), 2400);
  };

  const toggleFavoriteDeal = (deal: Deal, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const dealId = String(deal.id);
    const exists = savedDealIds.includes(dealId);
    const nextIds = exists
      ? savedDealIds.filter((id) => id !== dealId)
      : [...savedDealIds, dealId];

    setSavedDealIds(nextIds);

    try {
      localStorage.setItem("dealhoan_favorite_deal_ids", JSON.stringify(nextIds));

      const rawDeals = localStorage.getItem("dealhoan_favorite_deals");
      let storedDeals: Deal[] = [];
      if (rawDeals) {
        try {
          const parsed = JSON.parse(rawDeals);
          if (Array.isArray(parsed)) storedDeals = parsed;
        } catch {
          storedDeals = [];
        }
      }

      if (exists) {
        storedDeals = storedDeals.filter((d) => String(d?.id) !== dealId);
      } else {
        storedDeals = [deal, ...storedDeals.filter((d) => String(d?.id) !== dealId)].slice(0, 100);
      }
      localStorage.setItem("dealhoan_favorite_deals", JSON.stringify(storedDeals));
    } catch {
      // ignore localStorage errors
    }

    notify(
      exists
        ? "Đã bỏ lưu deal"
        : "❤️ Đã lưu vào yêu thích",
    );
  };
  const signInWithGoogle = async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      notify("Đang mở tài khoản Demo...");
      const demoUser = {
        id: "demo-user-123",
        email: "demo@dealhoan.vn",
        app_metadata: {},
        user_metadata: {
          full_name: "Nguyễn Văn Demo",
          name: "Nguyễn Văn Demo",
          avatar_url: "",
        },
        aud: "authenticated",
        created_at: new Date().toISOString(),
      } as User;
      setUser(demoUser);
      setAccountOpen(true);
      return;
    }

    setAuthPending(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setAuthPending(false);
      notify("Lỗi đăng nhập, vui lòng thử lại");
    }
  };
  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setUser(null);
      setUserBalance(null);
      notify("Đã đăng xuất Demo");
      return;
    }

    setAuthPending(true);
    const { error } = await supabase.auth.signOut();
    setAuthPending(false);
    if (error) return notify("Lỗi đăng xuất, vui lòng thử lại");
    setUser(null);
    setUserBalance(null);
    notify("Đã đăng xuất");
  };
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUser(data.user);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
  const getAffiliateUrl = (url?: string | null) => {
    if (!url) return "https://shopee.vn";
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://dealhoan.vn";
    const subId = user ? `u_${user.id.slice(0, 8)}` : "dealhoan";
    if (isShopeeUrl(url)) {
      return buildShopeeAffiliateUrl(url, { subId });
    }
    return buildCustomShortUrl(url, { baseUrl, subId });
  };

  const executeCalculation = async (targetUrl: string) => {
    const rawClean = extractUrlFromText(targetUrl);
    const trimmed = (rawClean || targetUrl).trim();
    if (!trimmed) {
      setInputError(true);
      setTimeout(() => setInputError(false), 600);
      setTimeout(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      }, 1000);
      return notify("Vui lòng dán link sản phẩm 🙂");
    }

    if (rawClean && rawClean !== targetUrl) {
      setLink(rawClean);
    }

    (document.activeElement as HTMLElement | null)?.blur();
    setBusy(true);

    const subId = user ? `u_${user.id.slice(0, 8)}` : "calc";

    // 1. If it is a sample chip demo (e.g. clicked chip buttons), display immediately
    if (SAMPLE_CHIP_PRODUCTS[trimmed]) {
      const chipProduct = SAMPLE_CHIP_PRODUCTS[trimmed];
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://dealhoan.vn";
      const localTracked = isShopeeUrl(trimmed)
        ? buildShopeeAffiliateUrl(trimmed, { subId })
        : buildCustomShortUrl(trimmed, { baseUrl, subId });
      setCalcPercent(100);
      await new Promise((r) => setTimeout(r, 180));
      setCalculatedProduct(chipProduct);
      setTrackedLink(localTracked);
      setCopiedTracked(false);
      setResultClosing(false);
      setResult(chipProduct.platform);
      setBusy(false);
      notify("✓ Đã gắn mã hoàn tiền DealHoàn");
      return;
    }

    // 2. For pasted/entered links: reset previous receipt so no stale/old price is shown
    if (result) {
      setResult("");
      setCalculatedProduct(null);
    }

    // 3. Wait until server returns ALL real data before dropping down receipt
    const allAvailableDeals = [...hotDeals, ...flashDeals];
    let resolvedProduct: CalculatedProduct | null = null;
    let resolvedTracked = "";
    try {
      const res = await fetch("/api/deals/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, subId }),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.product) {
          resolvedProduct = data.product;
          if (data.trackedLink) {
            resolvedTracked = data.trackedLink;
          }
        }
      } else {
        throw new Error("Server resolve failed");
      }
    } catch {
      // Fallback only if server request completely fails
      resolvedProduct = resolveProductLocally(trimmed, allAvailableDeals);
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://dealhoan.vn";
      resolvedTracked = isShopeeUrl(trimmed)
        ? buildShopeeAffiliateUrl(trimmed, { subId })
        : buildCustomShortUrl(trimmed, { baseUrl, subId });
    } finally {
      if (resolvedProduct) {
        setCalcPercent(100);
        await new Promise((r) => setTimeout(r, 200));
        setCalculatedProduct(resolvedProduct);
        if (resolvedTracked) {
          setTrackedLink(resolvedTracked);
        }
        setCopiedTracked(false);
        setResultClosing(false);
        setResult(resolvedProduct.platform);
      }
      setBusy(false);
      notify("✓ Đã gắn mã hoàn tiền DealHoàn");
    }
  };

  const calc = (e: React.FormEvent) => {
    e.preventDefault();
    executeCalculation(link);
  };
  const visibleHotDeals = [...hotDeals].sort(HOT_SORTERS[tab]);
  const tm = [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  ].map((x) => String(x).padStart(2, "0"));
  return (
    <main>
      <div className="utility">
        <div className="container">
          <div className="utility-left">
            <span>Hoàn tiền từ Shopee · TikTok Shop · Lazada</span>
            <a href="#how">Cách hoạt động</a>
            <a href="#faq">Câu hỏi thường gặp</a>
          </div>
          <div className="utility-right">
            <a>Tải app</a>
            <a className="mint" href="#referral">
              Mời bạn — nhận hoa hồng
            </a>
          </div>
        </div>
      </div>
      <header>
        <div className="container nav">
          <Link className="brand" href="/" title="DealHoàn — dán link, nhận hoàn tiền">
            <span className="brand-mark" aria-hidden="true">
              <img src="/brand/deal-hoan-mark.png" alt="" />
            </span>
            <span className="brand-wordmark">
              <img src="/brand/deal-hoan-logo.png" alt="DealHoàn — Săn deal · Hoàn tiền" />
            </span>
          </Link>
          <form className="search" onSubmit={calc}>
            <span>⌕</span>
            <input placeholder="Tìm sản phẩm, deal, mã giảm giá…" />
            <button>Tìm deal</button>
          </form>
          <nav>
            <a className="active" href="#deals">
              Deal hot
            </a>
            <a href="#coupons">Mã giảm giá</a>
            <a href="#how">Cashback</a>
          </nav>
          <div className="account">
            {user ? (
              <>
                {isAdminUser(user) && (
                  <Link
                    href="/admin"
                    className="header-admin-btn"
                    title="Bảng Quản Trị Hệ Thống (Admin)"
                  >
                    🛡️ Quản trị
                  </Link>
                )}
                <button
                  type="button"
                  className="account-wallet-btn"
                  onClick={() => setAccountOpen(true)}
                  title="Mở ví hoàn tiền & rút tiền"
                >
                  <span className="account-avatar">
                    {user.user_metadata?.avatar_url ? (
                      <img src={user.user_metadata.avatar_url} alt="" />
                    ) : (
                      (user.user_metadata?.full_name || user.email || "U").charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="account-name">
                    {String(user.user_metadata?.full_name ?? user.email ?? "Tài khoản").split(" ")[0]}
                  </span>
                  <span className="account-balance-tag">
                    {userBalance !== null ? `${userBalance.toLocaleString("vi-VN")}đ` : "Ví tiền"}
                  </span>
                </button>
                <button disabled={authPending} onClick={signOut} className="account-logout-btn">
                  {authPending ? "…" : "Đăng xuất"}
                </button>
              </>
            ) : (
              <button disabled={authPending} onClick={signInWithGoogle} className="account-login-btn">
                {authPending ? (
                  "Đang mở…"
                ) : (
                  <>
                    <span className="auth-btn-desktop">Đăng nhập Google</span>
                    <span className="auth-btn-mobile">Đăng nhập</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </header>
      <section className="hero">
        <i className="orb peach" />
        <i className="orb mint-orb" />
        <div className="container hero-inner">
          <div className="badge">
            <i />
            1.248 deal mới hôm nay
          </div>
          <h1>
            Dán link,
            <br />
            biết ngay <span>tiền hoàn</span>
          </h1>
          <p>
            Tự áp mã, so giá và tính sẵn{" "}
            <b>chi phí thực sau hoàn tiền</b> trước khi mua.
          </p>
          <form
            className={`calculator ${inputError ? "input-error" : ""} ${link ? "has-link" : ""}`}
            onSubmit={calc}
          >
            <i>🔗</i>
            <input
              ref={linkInputRef}
              value={link}
              onChange={(e) => {
                const nextLink = e.target.value;
                setLink(nextLink);
                if (!nextLink.trim() && result && !resultClosing) {
                  setResultClosing(true);
                  setTimeout(() => {
                    setResult("");
                    setCalculatedProduct(null);
                    setResultClosing(false);
                  }, 420);
                }
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData?.getData("text") || "";
                const extracted = extractUrlFromText(pasted);
                if (extracted && extracted !== pasted) {
                  e.preventDefault();
                  setLink(extracted);
                }
                requestAnimationFrame(() => {
                  if (linkInputRef.current) linkInputRef.current.scrollLeft = 0;
                });
              }}
              placeholder="Dán link sản phẩm Shopee, TikTok, Lazada…"
            />
            {link && (
              <button
                type="button"
                className="calculator-clear"
                aria-label="Xoá link"
                onClick={() => {
                  setLink("");
                  if (result && !resultClosing) {
                    setResultClosing(true);
                    setTimeout(() => {
                      setResult("");
                      setCalculatedProduct(null);
                      setResultClosing(false);
                    }, 420);
                  }
                  linkInputRef.current?.focus();
                }}
              >
                ×
              </button>
            )}
            <button
              type="submit"
              className={`primary ${busy ? "is-calculating" : ""}`}
              disabled={busy}
            >
              {busy ? (
                <span className="calculating-content">
                  <span className="calc-spinner" aria-hidden="true" />
                  <span>Đang tính…</span>
                  <span className="calc-timer-tag">{calcPercent}%</span>
                </span>
              ) : (
                "⚡ Tính hoàn tiền"
              )}
            </button>
          </form>
          {result && (
            <div
              className={`result-collapse ${resultClosing ? "is-closing" : ""}`}
            >
              <div className="result-clip">
                <div
                  className={`result ${resultClosing ? "result-closing" : ""}`}
                >
                  <Receipt
                    platform={result}
                    product={calculatedProduct}
                    trackedLink={trackedLink}
                    copied={copiedTracked}
                    onCopy={() => {
                      navigator.clipboard?.writeText(trackedLink);
                      setCopiedTracked(true);
                      try {
                        confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
                      } catch {}
                      setTimeout(() => setCopiedTracked(false), 1500);
                      notify("✓ Đã copy link hoàn tiền");
                    }}
                    onBuy={() => {
                      if (buyDontShow) {
                        window.open(
                          trackedLink || (link ? getAffiliateUrl(link) : "https://shopee.vn"),
                          "_blank",
                          "noopener",
                        );
                        notify(`Đang chuyển tới ${result}...`);
                      } else setBuyOpen(true);
                    }}
                    onClear={() => {
                      if (resultClosing) return;
                      setResultClosing(true);
                      setTimeout(() => {
                        setLink("");
                        setResult("");
                        setCalculatedProduct(null);
                        setResultClosing(false);
                        linkInputRef.current?.focus();
                      }, 420);
                    }}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="chips">
            <span className="chips-label">Hỗ trợ:</span>
            <button
              type="button"
              onClick={() => {
                const sample = "https://shopee.vn/tai-nghe-sony";
                setLink(sample);
                executeCalculation(sample);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M6.6 8.4h10.8L18.5 19a1.8 1.8 0 0 1-1.8 2H7.3A1.8 1.8 0 0 1 5.5 19zM9 8.2V6.8a3 3 0 0 1 6 0v1.4"
                  stroke="#EE4D2D"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Shopee
            </button>
            <button
              type="button"
              onClick={() => {
                const sample = "https://vt.tiktok.com/ZS8abcd/";
                setLink(sample);
                executeCalculation(sample);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M13.2 15.5V4.8c.7 1.9 2.4 3.5 4.6 3.8"
                  stroke="#171717"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
                <circle
                  cx="9.7"
                  cy="15.9"
                  r="3.5"
                  stroke="#171717"
                  strokeWidth="2.4"
                />
              </svg>
              TikTok Shop
            </button>
            <button
              type="button"
              onClick={() => {
                const sample = "https://lazada.vn/products/sony";
                setLink(sample);
                executeCalculation(sample);
              }}
            >
              <LazadaLogo />
              Lazada
            </button>
          </div>
          <div className="live" aria-label="Hoạt động hoàn tiền trực tiếp">
            <b>
              <i />
              LIVE
            </b>
            <div className="live-ticker">
              <div className="live-ticker-items">
                <span>
                  Minh T. vừa nhận hoàn <strong>86.000đ</strong> từ Shopee
                </span>
                <span>
                  Hằng N. vừa nhận hoàn <strong>42.500đ</strong> từ TikTok Shop
                </span>
                <span>
                  Quốc B. vừa nhận hoàn <strong>129.000đ</strong> từ Lazada
                </span>
                <span>
                  Thảo V. vừa nhận hoàn <strong>58.000đ</strong> từ Shopee
                </span>
                <span>
                  Minh T. vừa nhận hoàn <strong>86.000đ</strong> từ Shopee
                </span>
              </div>
            </div>
          </div>
          <div className="stats">
            <div>
              <b>2,1 tỷ đ</b>
              <span className="stats-desc">
                đã hoàn cho<br className="stats-br" /> người dùng
              </span>
            </div>
            <hr />
            <div>
              <b>380k+</b>
              <span className="stats-desc">
                thành viên<br className="stats-br" /> săn deal
              </span>
            </div>
            <hr />
            <div>
              <b>3 sàn</b>
              <span className="stats-desc">
                Shopee · TikTok ·<br className="stats-br" /> Lazada
              </span>
            </div>
          </div>
        </div>
        <div className="container platforms">
          {[
            ["Shopee", "8.240", "12%", "orange"],
            ["TikTok Shop", "5.130", "10%", "dark"],
            ["Lazada", "3.960", "9%", "blue"],
          ].map((p, i) => (
            <a className="platform" key={p[1]}>
              <i className={`${p[3]} platform-${i}`}>
                {i === 0 && <span className="sr-only">Shopee</span>}
                {i === 1 && (
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M13.2 15.5V4.8c.7 1.9 2.4 3.5 4.6 3.8"
                      stroke="#fff"
                      strokeWidth="2.3"
                      strokeLinecap="round"
                    />
                    <circle
                      cx="9.7"
                      cy="15.9"
                      r="3.5"
                      stroke="#fff"
                      strokeWidth="2.3"
                    />
                  </svg>
                )}
                {i === 2 && <LazadaLogo />}
              </i>
              <span>
                <b>{p[0]}</b>
                <small>{p[1]} deal đang mở</small>
              </span>
              <em>Hoàn đến {p[2]}</em>
            </a>
          ))}
        </div>
      </section>
      <section className="container flash-section">
        <div className="flash">
          <div className="flash-top">
            <div className="flash-top-left">
              <h2>⚡ Deal chớp nhoáng</h2>
              <div className="flash-countdown-group">
                <div className="timer">
                  <span>{tm[0]}</span>
                  <span className="timer-colon">:</span>
                  <span>{tm[1]}</span>
                  <span className="timer-colon">:</span>
                  <span className="timer-sec">{tm[2]}</span>
                </div>
              </div>
            </div>
            <div className="flash-top-right">
              <div className="flash-nav-btns">
                <button
                  type="button"
                  className="flash-nav-btn"
                  title="Cuộn trái"
                  onClick={() => {
                    pauseFlash(8000);
                    if (flashScrollRef.current) {
                      flashScrollRef.current.scrollBy({ left: -260, behavior: "smooth" });
                    }
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="flash-nav-btn"
                  title="Cuộn phải"
                  onClick={() => {
                    pauseFlash(8000);
                    if (flashScrollRef.current) {
                      flashScrollRef.current.scrollBy({ left: 260, behavior: "smooth" });
                    }
                  }}
                >
                  ›
                </button>
              </div>
            </div>
          </div>
          <div
            className="flash-scroll"
            ref={flashScrollRef}
            onMouseEnter={() => {
              isFlashHoveredRef.current = true;
            }}
            onMouseLeave={() => {
              isFlashHoveredRef.current = false;
            }}
            onTouchStart={() => {
              isFlashHoveredRef.current = true;
            }}
            onTouchEnd={() => {
              pauseFlash(6000);
            }}
            onWheel={() => {
              pauseFlash(6000);
            }}
          >
            <div className="flash-grid">
              {flashDeals.map((deal) => (
                <article key={deal.id}>
                  <div className="placeholder">
                    <a
                      href={getAffiliateUrl(deal.productUrl)}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="deal-image-link"
                      aria-label={deal.name}
                    >
                      {deal.imageUrl ? (
                        // Scraped deal images come from unpredictable CDN hosts, so
                        // next/image's static host allowlist doesn't fit here.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={deal.imageUrl} alt={deal.name} className="deal-image" loading="lazy" />
                      ) : (
                        "ảnh sản phẩm"
                      )}
                    </a>
                    <b>−{deal.discountPercent}%</b>
                    <button
                      type="button"
                      className={`deal-fav-btn ${savedDealIds.includes(String(deal.id)) ? "is-active" : ""}`}
                      aria-label={
                        savedDealIds.includes(String(deal.id)) ? "Bỏ lưu deal" : "Lưu deal yêu thích"
                      }
                      title={
                        savedDealIds.includes(String(deal.id)) ? "Bỏ lưu deal" : "Lưu deal yêu thích"
                      }
                      onClick={(e) => toggleFavoriteDeal(deal, e)}
                    >
                      <HeartIcon filled={savedDealIds.includes(String(deal.id))} />
                    </button>
                  </div>
                  <strong>
                    <a
                      href={getAffiliateUrl(deal.productUrl)}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                    >
                      {deal.name}
                    </a>
                  </strong>
                  <div>
                    <em>{formatPrice(deal.price)}</em>
                    {deal.originalPrice > deal.price && (
                      <s>{formatPrice(deal.originalPrice)}</s>
                    )}
                  </div>
                  <small>
                    {formatSold(deal.sold) && <>Đã bán {formatSold(deal.sold)} · </>}
                    hoàn <b>{formatPrice(deal.cashback)}</b>
                  </small>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="container block" id="deals">
        <div className="heading">
          <div>
            <h2>Deal hot hôm nay</h2>
          </div>
          <a>Xem tất cả →</a>
        </div>
        <div className="preview-tabs">
          {HOT_TABS.map((x, i) => (
            <button
              key={x}
              className={`preview-tab ${tab === i ? "active" : ""}`}
              onClick={() => setTab(i)}
            >
              {x}
            </button>
          ))}
        </div>
        <div className="deal-grid" key={`hot-deals-${tab}`}>
          {visibleHotDeals.map((deal, idx) => (
            <article
              className="deal deal-fade-in"
              key={deal.id}
              style={{ animationDelay: `${Math.min(idx * 35, 280)}ms` }}
            >
              <div className="placeholder">
                <a
                  href={getAffiliateUrl(deal.productUrl)}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="deal-image-link"
                  aria-label={deal.name}
                >
                  {deal.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- see flash-grid note above
                    <img src={deal.imageUrl} alt={deal.name} className="deal-image" loading="lazy" />
                  ) : (
                    "ảnh sản phẩm"
                  )}
                </a>
                <b>−{deal.discountPercent}%</b>
                <span>🔥 {deal.dealScore}</span>
                <button
                  type="button"
                  className={`deal-fav-btn ${savedDealIds.includes(String(deal.id)) ? "is-active" : ""}`}
                  aria-label={
                    savedDealIds.includes(String(deal.id)) ? "Bỏ lưu deal" : "Lưu deal yêu thích"
                  }
                  title={
                    savedDealIds.includes(String(deal.id)) ? "Bỏ lưu deal" : "Lưu deal yêu thích"
                  }
                  onClick={(e) => toggleFavoriteDeal(deal, e)}
                >
                  <HeartIcon filled={savedDealIds.includes(String(deal.id))} />
                </button>
              </div>
              <div className="deal-body">
                <small>
                  <b>{deal.platform}</b>
                  {formatSold(deal.sold)
                    ? ` · đã bán ${formatSold(deal.sold)}`
                    : ""}
                </small>
                <strong>
                  <a
                    href={getAffiliateUrl(deal.productUrl)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    {deal.name}
                  </a>
                </strong>
                <div>
                  <em>{formatPrice(deal.price)}</em>
                  {deal.originalPrice > deal.price && (
                    <s>{formatPrice(deal.originalPrice)}</s>
                  )}
                </div>
                <footer>
                  <b>₫ Hoàn {formatPrice(deal.cashback)}</b>
                  <a
                    href={getAffiliateUrl(deal.productUrl)}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    Mua ngay →
                  </a>
                </footer>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="container block" id="coupons">
        {/* Hero banner section from preview.html */}
        <div className="coupon-hero">
          <div>
            <div className="brand">
              <span className="bag-logo">S</span> Shopee
            </div>
            <h2>
              Mã giảm giá <span>Shopee</span>
            </h2>
            <p className="hero-sub">
              Săn mã dễ dàng – mua sắm tiết kiệm – ưu tiên những mã hot nhất theo từng kênh.
            </p>
            <div className="benefits">
              <div className="benefit">
                <i>⚡</i>
                <span>Cập nhật mỗi ngày</span>
              </div>
              <div className="benefit">
                <i>✓</i>
                <span>Áp dụng nhanh</span>
              </div>
              <div className="benefit">
                <i>₫</i>
                <span>Tiết kiệm hơn</span>
              </div>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="coupon-float one">%</div>
            <div className="coupon-float two">%</div>
            <div className="coupon-float three">SALE</div>
            <div className="shop-bag">Shopee</div>
          </div>
        </div>

        <div className="preview-section-head">
          <div>
            <h2>🔥 Mã giảm giá nổi bật</h2>
          </div>
        </div>

        <div className="preview-tabs">
          {COUPON_TABS.map((t) => (
            <button
              key={t.key}
              className={`preview-tab ${couponTab === t.key ? "active" : ""}`}
              onClick={() => {
                setCouponTab(t.key);
                setShowAllCoupons(false);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="preview-grid" key={`coupons-${couponTab}-${showAllCoupons}`}>
          {displayedCoupons.slice(0, showAllCoupons ? undefined : 6).map((c, idx) => {
            const theme = getCardLogoAndTheme(c);
            const isSocial =
              c.category === "facebook" ||
              c.category === "instagram" ||
              c.category === "youtube" ||
              c.category === "social";

            return (
              <article
                className={`preview-card ${theme.cardClass} coupon-fade-in`}
                key={c.id}
                style={{ animationDelay: `${Math.min(idx * 30, 200)}ms` }}
              >
                <div className="preview-card-top">
                  <div className={`preview-logo ${theme.logoClass}`} aria-label={c.title}>
                    {theme.svg}
                  </div>
                  <div className="preview-card-info">
                    <div className="preview-card-title-wrap">
                      <h3>{c.title}</h3>
                      <span className="preview-tag">{theme.tag}</span>
                    </div>
                    <div className="sub">{c.subtitle || `${c.amount} ${c.unit}`}</div>
                  </div>
                </div>
                <div className="preview-meta">{c.condition}</div>
                {isSocial ? (
                  <button
                    type="button"
                    className="preview-cta"
                    onClick={() => {
                      linkInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      linkInputRef.current?.focus();
                      notify("⚡ Dán link sản phẩm vào ô trên nhé");
                    }}
                  >
                    Lấy mã ngay <span>→</span>
                  </button>
                ) : (
                  <a
                    href={getAffiliateUrl(c.url || "https://shopee.vn/m/ma-giam-gia")}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="preview-cta"
                    onClick={() => {
                      if (c.code) {
                        navigator.clipboard?.writeText(c.code);
                        setCopiedCode(c.code);
                        notify(`✓ Đã copy mã ${c.code}`);
                        setTimeout(() => setCopiedCode(null), 3000);
                      }
                    }}
                  >
                    {copiedCode === c.code ? (
                      "✓ Đang mở Shopee"
                    ) : (
                      <>
                        {c.category === "vip" ? "Xem ưu đãi" : "Lấy mã ngay"} <span>→</span>
                      </>
                    )}
                  </a>
                )}
              </article>
            );
          })}
        </div>

        {displayedCoupons.length > 6 && (
          <div className="preview-more-wrap">
            <button
              type="button"
              className="preview-more-btn"
              onClick={() => setShowAllCoupons((prev) => !prev)}
            >
              {showAllCoupons ? (
                <>
                  Thu gọn bớt <span>↑</span>
                </>
              ) : (
                <>
                  Xem thêm {displayedCoupons.length - 6} mã khác <span>↓</span>
                </>
              )}
            </button>
          </div>
        )}
      </section>
      <section className="container block" id="how">
        <div className="how">
          <div>
            <h2>Cashback hoạt động thế nào?</h2>
            <p>
              Minh bạch từng bước — tiền hoàn có trạng thái rõ ràng, không cam
              kết mơ hồ.
            </p>
            {[
              [
                "Dán link hoặc chọn deal",
                "Dán link sản phẩm để DealHoàn tính tiền hoàn, hoặc chọn deal đã tính sẵn giá thực trả.",
              ],
              [
                "Mua qua liên kết",
                "Bấm mua và nhận hoàn tiền — bạn mua trực tiếp trên sàn như bình thường.",
              ],
              [
                "Cashback chờ duyệt",
                "Đơn ghi nhận trong 24 giờ, trạng thái chờ duyệt đến khi hết hạn đổi trả.",
              ],
              [
                "Rút tiền về tài khoản",
                "Cashback được duyệt vào ví, rút về tài khoản ngân hàng từ 50.000đ.",
              ],
            ].map((s, i) => (
              <div className="step" key={s[0]}>
                <i>{i + 1}</i>
                <span>
                  <b>{s[0]}</b>
                  <small>{s[1]}</small>
                </span>
              </div>
            ))}
          </div>
          <div className="demo">
            <span className="float top">▼ Giá thấp nhất 30 ngày</span>
            <span className="float bottom">✓ +77.000đ hoàn sau 14 ngày</span>
            <DemoReceipt />
          </div>
        </div>
      </section>
      <section className="container block" id="referral">
        <div className="referral">
          <div>
            <h2>Mời bạn bè, nhận hoa hồng</h2>
            <p>
              Nhận 20.000đ khi bạn bè hoàn thành đơn đầu tiên, cộng 5% hoa hồng
              từ cashback của họ trong 6 tháng.
            </p>
          </div>
          <div>
            <button
              className="primary"
              onClick={() => {
                navigator.clipboard?.writeText(
                  "https://dealhoan.vn/ref/BAN2026",
                );
                setRefCopied(true);
                try {
                  confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
                } catch {}
                setTimeout(() => setRefCopied(false), 2500);
                notify("✓ Đã copy link giới thiệu");
              }}
            >
              {refCopied ? "✓ Đã copy link" : "Copy link giới thiệu"}
            </button>
            <button className="outline">Chia sẻ Zalo</button>
          </div>
        </div>
      </section>
      <footer className="site-footer">
        <div className="container">
          <div>
            <h3>
              Deal<span>Hoàn</span>
            </h3>
            <p>
              Nền tảng săn deal & hoàn tiền cho người mua sắm thông minh tại
              Việt Nam.
            </p>
          </div>
          <div className="footer-links">
            <div>
              <b>Khám phá</b>
              <a>Deal hot</a>
              <a>Mã giảm giá</a>
              <a>Danh mục</a>
              <a>Thương hiệu</a>
            </div>
            <div id="faq">
              <b>Cashback</b>
              <a>Cách hoạt động</a>
              <a>Chính sách hoàn tiền</a>
              <a>Rút tiền</a>
              <a>FAQ</a>
            </div>
            <div>
              <b>DealHoàn</b>
              <a>Giới thiệu bạn bè</a>
              <a>Blog</a>
              <a>Liên hệ</a>
            </div>
          </div>
        </div>
        <small>
          © 2026 DealHoàn. Cashback ghi nhận qua liên kết tiếp thị của các sàn
          TMĐT.
        </small>
      </footer>
      {buyOpen && (
        <div className="buy-overlay" onClick={() => setBuyOpen(false)}>
          <div className="buy-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setBuyOpen(false)}>
              ✕
            </button>
            <span className="modal-badge">🛡 Lưu ý trước khi mua</span>
            <h3>Để không mất hoàn tiền</h3>
            <p>
              <span className="buy-sub-desktop">
                Đây là các lỗi thường gặp khiến đơn không được ghi nhận hoặc bị
                sàn từ chối.{" "}
              </span>
              <a href="#how" onClick={() => setBuyOpen(false)}>
                Xem hướng dẫn ▸
              </a>
            </p>
            <div className="buy-rules">
              {[
                [
                  "Xoá sản phẩm khỏi giỏ hàng",
                  "trước khi vào link đã chuyển đổi, sau đó thêm lại từ phiên mua mới.",
                ],
                [
                  "Không bấm link, banner hay video khác",
                  "sau khi đã mở link hoàn tiền.",
                ],
                [
                  "Chờ khoảng 10 giây sau khi mở app",
                  "rồi mới đặt hàng — không thao tác quá nhanh.",
                ],
                [
                  "Không dùng trình duyệt ẩn danh",
                  "hoặc chặn cookie/quảng cáo — hệ thống ghi nhận đơn qua cookie.",
                ],
                [
                  "Không tự mua qua tài khoản affiliate",
                  "hoặc tài khoản liên quan nếu sàn không cho phép.",
                ],
                [
                  "Đơn huỷ, hoàn trả không được hoàn tiền",
                  "theo quy định đối soát của sàn.",
                ],
              ].map(([head, body]) => (
                <div key={head}>
                  <b>✓</b>
                  <span>
                    <strong>{head}</strong>{" "}
                    <span className="buy-rule-body">{body}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="buy-warning">
              ⚠️{" "}
              <span>
                Kết quả ghi nhận đơn phụ thuộc vào sàn và đối tác. Hệ thống
                không thể sửa đơn đã bị sàn đánh dấu không hợp lệ.
              </span>
            </div>
            <div className="buy-bottom">
              <label className="buy-dont-show">
                <input
                  type="checkbox"
                  checked={buyDontShow}
                  onChange={(e) => setBuyDontShow(e.target.checked)}
                />{" "}
                Đã hiểu, không hiện lại lần sau
              </label>
              <div className="buy-actions">
                <button onClick={() => setBuyOpen(false)}>Đóng</button>
                <button
                  className="primary"
                  disabled={!buyDontShow}
                  onClick={() => {
                    setBuyOpen(false);
                    window.open(
                      trackedLink || (link ? getAffiliateUrl(link) : "https://shopee.vn"),
                      "_blank",
                      "noopener",
                    );
                    notify(`Đang chuyển tới ${result}...`);
                  }}
                >
                  <span className="buy-btn-desktop">Tôi đã đọc, tiếp tục mua hàng →</span>
                  <span className="buy-btn-mobile">Tiếp tục mua hàng →</span>
                </button>
              </div>
            </div>
            <footer>
              Mở <strong>{result || "Shopee Mall"}</strong> trong tab mới · ghi nhận trong 24 giờ · nhận
              hoàn sau 14–15 ngày
            </footer>
          </div>
        </div>
      )}
      {accountOpen && user && (
        <AccountModal
          user={user}
          onClose={() => {
            setAccountOpen(false);
            fetchUserBalance();
          }}
          onSignOut={() => {
            setAccountOpen(false);
            signOut();
          }}
          onNotify={notify}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
