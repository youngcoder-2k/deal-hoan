"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { ArrowArcRightIcon } from "@phosphor-icons/react/dist/csr/ArrowArcRight";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { CopyIcon } from "@phosphor-icons/react/dist/csr/Copy";
import { CurrencyCircleDollarIcon } from "@phosphor-icons/react/dist/csr/CurrencyCircleDollar";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { ShoppingCartIcon } from "@phosphor-icons/react/dist/csr/ShoppingCart";
import { LinkIcon } from "@phosphor-icons/react/dist/csr/Link";
import { formatPrice } from "@/lib/deals/format";
import type { CalculatedProduct } from "@/lib/deals/resolve";
import styles from "../home-redesign.module.css";

export function MarketplaceBrand({ platform }: { platform: string }) {
  if (platform.toLowerCase().includes("lazada")) {
    return <Image src="/brand/lazada-logo.png" width={108} height={34} alt="Lazada" className={styles.lazadaBrand} />;
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
      <div className={styles.marketplaces} aria-label="Hỗ trợ Shopee, TikTok Shop và Lazada">
        <span>Hỗ trợ:</span>
        <MarketplaceBrand platform="Shopee" />
        <MarketplaceBrand platform="TikTok Shop" />
        <MarketplaceBrand platform="Lazada" />
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

export function CashbackEmpty({ busy }: { busy: boolean }) {
  const steps = [
    { title: "Sao chép", detail: "link sản phẩm", Icon: CopyIcon },
    { title: "Dán link", detail: "vào ô trên", Icon: LinkIcon },
    { title: "Xem tiền", detail: "hoàn dự kiến", Icon: CurrencyCircleDollarIcon },
  ];
  return (
    <div className={`${styles.emptyCard} ${busy ? styles.emptyBusy : ""}`} aria-labelledby="cashback-empty-title">
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
      <p className={styles.emptySupport}>Hỗ trợ link từ Shopee, TikTok Shop và Lazada.</p>
      <div className={styles.guideFooter}>
        <a href="#how" className={styles.guideLink}>Cách lấy link sản phẩm <ArrowRightIcon size={22} aria-hidden="true" /></a>
      </div>
    </div>
  );
}

export function CashbackReceipt({ product, trackedLink, copied, onCopy, onBuy, onClear }: {
  product: CalculatedProduct;
  trackedLink: string;
  copied: boolean;
  onCopy: () => void;
  onBuy?: () => void;
  onClear: () => void;
}) {
  const { price, originalPrice, cashback } = product;
  // Savings may include marketplace discounts, so it is not the cashback rate.
  const cashbackRate = product.cashbackRate ?? (price > 0 ? Math.round(cashback / price * 1000) / 10 : 0);

  const [customPriceInput, setCustomPriceInput] = useState<string>("");
  const [showAdjuster, setShowAdjuster] = useState<boolean>(false);

  const customNumericPrice = customPriceInput ? Number(customPriceInput.replace(/\D/g, "")) : 0;
  const isCustomPriceActive = customNumericPrice > 0;
  const activePrice = isCustomPriceActive ? customNumericPrice : price;
  const activeCashback = isCustomPriceActive
    ? Math.round(activePrice * (cashbackRate / 100))
    : cashback;
  const reward = formatPrice(activeCashback);
  const targetUrl = product.trackedLink || trackedLink || (product.platform?.toLowerCase().includes("shopee") ? "https://shopee.vn" : "https://dealhoan.vn");
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
        <div><h3 title={product.name}>{product.name}</h3><p title={product.seller}>{product.platform}{product.seller ? ` · ${product.seller}` : ""}</p></div>
        <span className={styles.platformBadge}><MarketplaceBrand platform={product.platform} /></span>
      </div>
      <div className={styles.reward}>
        <div className={styles.rewardContent}>
          <p>
            Bạn được hoàn dự kiến
            {isCustomPriceActive && (
              <span style={{ fontSize: "11px", fontWeight: 500, color: "#c2410c", marginLeft: "5px" }}>
                (theo phân loại bạn chọn)
              </span>
            )}
          </p>
          <div className={styles.rewardAmountRow}>
            <strong className={reward.length > 9 ? styles.longAmount : ""}>{reward}</strong>
            <span className={styles.ratePill}>Hoàn {cashbackRate.toLocaleString("vi-VN")}%</span>
          </div>
          <span className={styles.rewardTiming}>Nhận sau 14–15 ngày · Hoàn chuẩn theo giá thực trả</span>
        </div>
      </div>
      <dl className={styles.priceSummary}>
        <div>
          <dt>Thanh toán</dt>
          <dd>
            {formatPrice(activePrice)}{" "}
            {!isCustomPriceActive && originalPrice > price && <s>{formatPrice(originalPrice)}</s>}
          </dd>
        </div>
        <div>
          <dt>Chi phí sau hoàn</dt>
          <dd className={styles.netCost}>{formatPrice(activePrice - activeCashback)}</dd>
        </div>
      </dl>

      {/* Interactive Variant Adjuster */}
      <div className={styles.variantAdjusterSection}>
        {!showAdjuster ? (
          <button
            type="button"
            className={styles.variantToggleBtn}
            onClick={() => setShowAdjuster(true)}
          >
            <span>🔄</span> Bạn chọn phân loại khác hoặc mua nhiều món? Bấm để tính nhanh
          </button>
        ) : (
          <div className={styles.variantAdjusterBox}>
            <div className={styles.variantAdjusterHeader}>
              <span className={styles.variantAdjusterTitle}>
                <span>💡</span> Nhập giá phân loại bạn chọn trên {product.platform || "Shopee"}:
              </span>
              <button
                type="button"
                className={styles.variantCloseBtn}
                onClick={() => {
                  setShowAdjuster(false);
                  setCustomPriceInput("");
                }}
              >
                ✕ Đóng
              </button>
            </div>

            <div className={styles.variantInputRow}>
              <div className={styles.variantInputWrap}>
                <input
                  type="text"
                  placeholder={`Ví dụ: ${formatPrice(Math.round(price * 2.33))}`}
                  value={customPriceInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (!val) {
                      setCustomPriceInput("");
                    } else {
                      setCustomPriceInput(Number(val).toLocaleString("vi-VN"));
                    }
                  }}
                  className={styles.variantInput}
                />
                <span className={styles.variantInputSuffix}>đ</span>
              </div>
              {isCustomPriceActive && (
                <button
                  type="button"
                  className={styles.variantResetBtn}
                  onClick={() => setCustomPriceInput("")}
                >
                  Giá gốc
                </button>
              )}
            </div>

            <div className={styles.variantQuickChips}>
              <span className={styles.variantChipLabel}>Gợi ý:</span>
              {[
                { label: "1.073k (Bộ lớn)", value: 1073000 },
                { label: "x2 số lượng", value: price * 2 },
                { label: "x3 số lượng", value: price * 3 },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className={styles.variantChip}
                  onClick={() => setCustomPriceInput(chip.value.toLocaleString("vi-VN"))}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Variant Guarantee Notice */}
      <div className={styles.variantGuarantee}>
        <div className={styles.variantGuaranteeIcon}>🛡️</div>
        <div className={styles.variantGuaranteeText}>
          <strong>Cam kết hoàn chuẩn theo phân loại thực tế:</strong>
          <span>
            Hệ thống DealHoàn ghi nhận đơn theo <b>tổng tiền thực tế bạn thanh toán tại {product.platform || "Shopee"}</b>. Dù bạn chọn phân loại nào hoặc mua thêm sản phẩm khác, bạn vẫn nhận đủ chuẩn <b>{cashbackRate}%</b> tiền hoàn vào ví!
          </span>
        </div>
      </div>
      {trackedLink && (
        <div className={styles.linkSection}>
          <p>Link nhận hoàn</p>
          <div className={styles.linkRow}>
            <a href={targetUrl} target="_blank" rel="noopener noreferrer" title={targetUrl}>{trackedLink}</a>
            <button type="button" className={copied ? styles.copied : ""} onClick={onCopy}>
              {copied ? <CheckIcon size={19} weight="bold" aria-hidden="true" /> : <CopyIcon size={19} aria-hidden="true" />}
              <span aria-live="polite">{copied ? "Đã copy" : "Copy link"}</span>
            </button>
          </div>
        </div>
      )}
      <a
        href={targetUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={styles.buyButton}
        onClick={() => {
          if (onBuy) onBuy();
        }}
      >
        <ShoppingCartIcon size={22} weight="duotone" aria-hidden="true" /> Mua ngay
      </a>
      <div className={styles.receiptFooter}>
        <span>Ghi nhận trong 24 giờ · <a href="#how">điều kiện</a></span>
        <button type="button" onClick={onClear}>Tính link khác <ArrowClockwiseIcon size={21} aria-hidden="true" /></button>
      </div>
    </div>
  );
}
