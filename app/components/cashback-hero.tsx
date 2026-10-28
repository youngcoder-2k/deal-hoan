"use client";

import { useState, type PointerEvent } from "react";
import Image from "next/image";
import shopeeFoodLogo from "@/public/brand/shopeefood-logo.png";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { ArrowArcRightIcon } from "@phosphor-icons/react/dist/csr/ArrowArcRight";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { CopyIcon } from "@phosphor-icons/react/dist/csr/Copy";
import { CurrencyCircleDollarIcon } from "@phosphor-icons/react/dist/csr/CurrencyCircleDollar";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { ShoppingCartIcon } from "@phosphor-icons/react/dist/csr/ShoppingCart";
import { LinkIcon } from "@phosphor-icons/react/dist/csr/Link";
import { PercentIcon } from "@phosphor-icons/react/dist/csr/Percent";
import { TicketIcon } from "@phosphor-icons/react/dist/csr/Ticket";
import { formatPrice } from "@/lib/deals/format";
import type { CalculatedProduct } from "@/lib/deals/resolve";
import styles from "../home-redesign.module.css";

export function MarketplaceBrand({ platform }: { platform: string }) {
  if (platform.toLowerCase().includes("lazada")) {
    return <Image src="/brand/lazada-logo.png" width={108} height={34} alt="Lazada" className={styles.lazadaBrand} />;
  }
  if (platform.toLowerCase().includes("food")) {
    return (
      <Image src={shopeeFoodLogo} alt="ShopeeFood" className={styles.shopeeFoodBrand} sizes="(max-width: 374px) 84px, (max-width: 600px) 92px, (max-width: 1200px) 108px, 124px" />
    );
  }
  const shopee = platform.toLowerCase().includes("shopee");
  return (
    <span className={`${styles.marketplaceBrand} ${shopee ? styles.shopeeBrand : ""}`}>
      <Image src={shopee ? "/brand/shopee.svg" : "/brand/tiktok.svg"} width={28} height={28} alt="" />
      {platform}
    </span>
  );
}

export function CashbackStory() {
  return (
    <div className={styles.story}>
      <h1 className={styles.slogan}>
        Mua sắm ngay,
        <span>Hoàn tiền<br className={styles.desktopBreak} /> liền tay</span>
      </h1>
      <p className={styles.storyDescription}>
        Dán link, xem tiền hoàn.<br />
        Mua món bạn thích, nhận lại một phần tiền.
      </p>
      <div className={styles.marketplaces} aria-label="Hỗ trợ Shopee và ShopeeFood">
        <span>Hỗ trợ:</span>
        <MarketplaceBrand platform="Shopee" />
        <MarketplaceBrand platform="ShopeeFood" />
      </div>
      <div className={styles.heroIllustration} aria-hidden="true">
        <Image className={styles.shoppingBag} src="/hero/deal-hoan-shopping-bag.webp" width={640} height={520} alt="" preload sizes="(max-width: 900px) 220px, 520px" />
        <Image className={`${styles.floatingCoin} ${styles.coinOne}`} src="/hero/cashback-coin.png" width={256} height={256} alt="" sizes="100px" />
        <Image className={`${styles.floatingCoin} ${styles.coinTwo}`} src="/hero/cashback-coin.png" width={256} height={256} alt="" sizes="140px" />
        <Image className={`${styles.floatingCoin} ${styles.coinThree}`} src="/hero/cashback-coin.png" width={256} height={256} alt="" sizes="84px" />
      </div>
    </div>
  );
}

const glassProperties = ["--glass-light-x", "--glass-light-y", "--glass-rotate-x", "--glass-rotate-y"];

function moveGlassLight(event: PointerEvent<HTMLDivElement>, surface?: HTMLDivElement) {
  // Touch scrolling and accessibility preferences never drive the optical tilt.
  if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce), (forced-colors: active)").matches) return;
  const shell = surface ?? event.currentTarget.parentElement;
  if (!shell) return;
  const rect = shell.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  shell.style.setProperty("--glass-light-x", `${(x * 100).toFixed(1)}%`);
  shell.style.setProperty("--glass-light-y", `${(y * 100).toFixed(1)}%`);
  shell.style.setProperty("--glass-rotate-x", `${((.5 - y) * 3).toFixed(2)}deg`);
  shell.style.setProperty("--glass-rotate-y", `${((x - .5) * 3).toFixed(2)}deg`);
}

function resetGlassLight(event: PointerEvent<HTMLDivElement>, surface?: HTMLDivElement) {
  const shell = surface ?? event.currentTarget.parentElement;
  glassProperties.forEach((property) => shell?.style.removeProperty(property));
}

export function CashbackEmpty({ busy }: { busy: boolean }) {
  const steps = [
    { title: "Sao chép", detail: "link sản phẩm", Icon: CopyIcon },
    { title: "Bấm nút dán", detail: "link vừa chép", Icon: LinkIcon },
    { title: "Xem tiền", detail: "hoàn dự kiến", Icon: CurrencyCircleDollarIcon },
  ];
  return (
    <div
      className={`${styles.emptyCard} ${busy ? styles.emptyBusy : ""}`}
      aria-labelledby="cashback-empty-title"
      onPointerMove={(event) => moveGlassLight(event)}
      onPointerLeave={(event) => resetGlassLight(event)}
      onPointerCancel={(event) => resetGlassLight(event)}
    >
      <div className={styles.emptyIntro}>
        <p className={styles.emptyEyebrow}>
          {busy ? "ĐANG KIỂM TRA LINK" : "CHỈ 3 BƯỚC"}
          <SparkleIcon size={20} weight="fill" aria-hidden="true" />
        </p>
        <div className={styles.emptyCoin} aria-hidden="true">
          <Image src="/hero/cashback-coin.png" width={256} height={256} alt="" sizes="(max-width: 600px) 54px, 72px" />
          <SparkleIcon className={styles.coinSparkle} size={19} weight="fill" />
          <SparkleIcon className={styles.coinSparkleSmall} size={12} weight="fill" />
        </div>
        <h2 id="cashback-empty-title">{busy ? <>Đang tìm tiền hoàn<br />cho bạn…</> : <>Dán link,<br />xem ngay tiền hoàn</>}</h2>
        <p className={styles.emptyDescription}>
          {busy ? "Đang kiểm tra sản phẩm. Bạn chờ một chút nhé." : "Xem khoản hoàn trước khi mua."}
        </p>
      </div>
      <ol className={styles.steps} aria-label="Ba bước xem tiền hoàn">
        {steps.map(({ title, detail, Icon }, index) => (
          <li key={title}>
            <div className={styles.stepIcon}>
              <span aria-hidden="true">{index + 1}</span>
              <Icon size={42} weight="bold" aria-hidden="true" />
            </div>
            <span className={styles.stepLabel}>{title}<br />{detail}</span>
            {index < 2 && <ArrowArcRightIcon className={styles.stepArrow} size={36} weight="light" aria-hidden="true" />}
            {index === 2 && <SparkleIcon className={styles.stepSparkle} size={13} weight="fill" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <p className={styles.emptySupport}>Hỗ trợ link từ Shopee, ShopeeFood, TikTok Shop và Lazada.</p>
      <div className={styles.guideFooter}>
        <a href="#how" className={styles.guideLink}>Cách lấy link sản phẩm <ArrowRightIcon size={22} aria-hidden="true" /></a>
      </div>
    </div>
  );
}

export function CashbackReceipt({
  product,
  trackedLink,
  copied,
  onCopy,
  onBuy,
  onClear,
  isLoggedIn = false,
  onRequireAuth,
}: {
  product: CalculatedProduct;
  trackedLink: string;
  copied: boolean;
  onCopy: () => void;
  onBuy?: () => boolean | void;
  onClear: () => void;
  isLoggedIn?: boolean;
  onRequireAuth?: (action?: "copy" | "link" | "buy") => void;
}) {
  const { price, cashback } = product;
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyVoucher = (code: string) => {
    try {
      navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {}
  };

  // Savings may include marketplace discounts, so it is not the cashback rate.
  const cashbackRate = product.cashbackRate ?? (price > 0 ? Math.round(cashback / price * 1000) / 10 : 0);
  const hasPrice = price > 0;
  const reward = hasPrice ? formatPrice(cashback).replace(/đ$/, "") : "Chưa xác định";
  const targetUrl = trackedLink || product.trackedLink || (product.platform?.toLowerCase().includes("shopee") ? "https://shopee.vn" : "https://dealhoan.vn");
  return (
    <div className={styles.receipt} aria-labelledby="cashback-result-title">
      <div className={styles.receiptHeading}>
        <h2 id="cashback-result-title">Kết quả hoàn tiền</h2>
      </div>
      <div className={styles.product}>
        {product.imageUrl && (
          // Marketplace images stay direct: some CDNs reject image-optimizer requests.
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.productImage} src={product.imageUrl} alt={product.name} width={64} height={64} />
        )}
        <div>
          <h3 title={product.name}>{product.name}</h3>
          <div className={styles.productPrice}>
            <strong>{hasPrice ? formatPrice(price) : "Chưa có giá"}</strong>
          </div>
        </div>
        <span className={styles.platformBadge}><MarketplaceBrand platform={product.platform} /></span>
      </div>
      <div
        className={styles.reward}
        onPointerMove={(event) => moveGlassLight(event, event.currentTarget)}
        onPointerLeave={(event) => resetGlassLight(event, event.currentTarget)}
        onPointerCancel={(event) => resetGlassLight(event, event.currentTarget)}
      >
        {hasPrice && <>
          <PercentIcon className={styles.rewardPercent} weight="bold" aria-hidden="true" />
          <PercentIcon className={`${styles.rewardPercent} ${styles.rewardPercentRight}`} weight="bold" aria-hidden="true" />
        </>}
        <div className={styles.rewardContent}>
          <p>Bạn được hoàn dự kiến</p>
          <div className={styles.rewardAmountRow}>
            {hasPrice && <Image className={styles.rewardCoin} src="/hero/cashback-coin-stack.webp" width={272} height={216} alt="" sizes="(max-width: 600px) 28px, 34px" />}
            <strong className={reward.length > 9 ? styles.longAmount : ""}>{reward}{hasPrice && <span className={styles.rewardCurrency}> đồng</span>}</strong>
          </div>
          {!hasPrice && <span className={styles.rewardTiming}>Chưa có giá và tiền hoàn từ sàn cho sản phẩm này.</span>}
        </div>
        {hasPrice && <div className={styles.rewardRate}>
          <span className={styles.ratePill}>Hoàn {cashbackRate.toLocaleString("vi-VN")}% giá trị đơn hàng</span>
        </div>}
      </div>

      {product.matchedVouchers && product.matchedVouchers.length > 0 && (
        <div className={styles.voucherSection}>
          <div className={styles.voucherHeading}>
            <TicketIcon size={16} weight="bold" />
            <span>
              Mã giảm giá có thể áp dụng ({product.matchedVouchers.filter((v) => v.isApplicable).length})
            </span>
          </div>
          <div className={styles.voucherList}>
            {product.matchedVouchers.slice(0, 4).map((mv, idx) => {
              const isCopied = copiedCode === mv.coupon.code;
              return (
                <div
                  key={mv.coupon.id || idx}
                  className={`${styles.voucherItem} ${!mv.isApplicable ? styles.voucherItemInapplicable : ""}`}
                >
                  <div className={styles.voucherInfo}>
                    <span className={styles.voucherBadge}>
                      {mv.coupon.badge || (mv.isApplicable ? "Shopee" : "Chưa đủ ĐK")}
                    </span>
                    <p className={styles.voucherTitle} title={mv.coupon.title}>
                      {mv.coupon.title}
                    </p>
                    <p className={styles.voucherCondition}>
                      {mv.isApplicable ? mv.coupon.condition : mv.reason || mv.coupon.condition}
                    </p>
                  </div>
                  {mv.isApplicable ? (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <span className={styles.voucherSavings}>
                        -{formatPrice(mv.calculatedDiscount)}
                      </span>
                      <div className={styles.voucherActions}>
                        <button
                          type="button"
                          className={`${styles.voucherCodeBtn} ${isCopied ? styles.voucherCodeBtnCopied : ""}`}
                          onClick={() => handleCopyVoucher(mv.coupon.code)}
                          title={isCopied ? "Đã chép mã Shopee" : "Bấm để sao chép mã Shopee"}
                        >
                          <span className={styles.voucherCodeText}>{mv.coupon.code}</span>
                          {isCopied ? (
                            <CheckIcon size={12} weight="bold" className={styles.voucherCodeIcon} />
                          ) : (
                            <CopyIcon size={12} className={styles.voucherCodeIcon} />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span className={styles.voucherCodeDisabled} title={mv.reason}>
                      {mv.coupon.code}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {trackedLink && (
        <div className={styles.linkSection}>
          <p>Link nhận hoàn</p>
          <div className={styles.linkRow}>
            {isLoggedIn ? (
              <a href={targetUrl} target="_blank" rel="noopener noreferrer" title={targetUrl}>{trackedLink}</a>
            ) : (
              <button
                type="button"
                className={styles.linkRowUnauth}
                title="Vui lòng đăng nhập để nhận hoàn tiền"
                onClick={() => onRequireAuth?.("link")}
              >
                {trackedLink}
              </button>
            )}
            <button
              type="button"
              className={copied ? styles.copied : ""}
              onClick={() => {
                if (!isLoggedIn) {
                  onRequireAuth?.("copy");
                  return;
                }
                onCopy();
              }}
            >
              {copied ? <CheckIcon size={19} weight="bold" aria-hidden="true" /> : <CopyIcon size={19} aria-hidden="true" />}
              <span aria-live="polite">{copied ? "Đã copy" : "Copy link"}</span>
            </button>
          </div>
        </div>
      )}
      {isLoggedIn ? (
        <a
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={styles.buyButton}
          onClick={(event) => {
            if (onBuy?.() === false) event.preventDefault();
          }}
        >
          <ShoppingCartIcon size={22} weight="duotone" aria-hidden="true" />
          {product.platform?.toLowerCase().includes("food") ? "Đặt món ngay" : "Mua ngay"}
        </a>
      ) : (
        <button
          type="button"
          className={styles.buyButton}
          onClick={() => {
            if (onRequireAuth) {
              onRequireAuth("buy");
            } else {
              onBuy?.();
            }
          }}
        >
          <ShoppingCartIcon size={22} weight="duotone" aria-hidden="true" />
          Đăng nhập để MUA NGAY
        </button>
      )}
      {product.platform?.toLowerCase().includes("food") && (
        <p className={styles.foodAppNote}>
          💡 Mở trực tiếp ứng dụng ShopeeFood để đặt món và nhận hoàn tiền 6%.
        </p>
      )}
      <div className={styles.receiptFooter}>
        <span>Ghi nhận trong 24 giờ · <a href="#how">điều kiện</a></span>
        <button type="button" onClick={onClear}>Tính link khác <ArrowClockwiseIcon size={21} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
