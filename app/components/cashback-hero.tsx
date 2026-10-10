"use client";

import Image from "next/image";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { CopyIcon } from "@phosphor-icons/react/dist/csr/Copy";
import { CurrencyCircleDollarIcon } from "@phosphor-icons/react/dist/csr/CurrencyCircleDollar";
import { InfoIcon } from "@phosphor-icons/react/dist/csr/Info";
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
    { label: "Sao chép link", Icon: CopyIcon },
    { label: "Dán vào ô trên", Icon: LinkIcon },
    { label: "Xem tiền hoàn", Icon: CurrencyCircleDollarIcon },
  ];
  return (
    <div className={`${styles.emptyCard} ${busy ? styles.emptyBusy : ""}`}>
      <p className={styles.emptyEyebrow}>{busy ? "ĐANG KIỂM TRA LINK CỦA BẠN" : "BẮT ĐẦU NHẬN HOÀN TIỀN"}</p>
      <Image className={styles.emptyIllustration} src="/hero/link-cashback-halo.webp" width={360} height={260} alt="" preload sizes="(max-width: 600px) 160px, 180px" />
      <h2>{busy ? "Đang tìm tiền hoàn cho bạn…" : "Dán link, xem ngay tiền hoàn"}</h2>
      <p className={styles.emptyDescription}>
        {busy ? "Đang kiểm tra thông tin sản phẩm và mức hoàn tiền. Bạn chờ một chút nhé." : <>Sao chép link từ Shopee, TikTok Shop hoặc Lazada<br className={styles.desktopBreak} /> rồi dán vào ô bên trên để xem tiền hoàn.</>}
      </p>
      <ol className={styles.steps}>
        {steps.map(({ label, Icon }, index) => (
          <li key={label}>
            <div className={styles.stepIcon}><span>{index + 1}</span><Icon size={34} weight="regular" aria-hidden="true" /></div>
            <span>{label}</span>
            {index < 2 && <CaretRightIcon className={styles.stepArrow} size={20} aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <a href="#how" className={styles.guideLink}>Xem hướng dẫn lấy link <ArrowRightIcon size={18} aria-hidden="true" /></a>
      <p className={styles.emptyNote}><InfoIcon size={25} aria-hidden="true" /> Giá sản phẩm và tiền hoàn sẽ hiển thị tại đây.</p>
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
  const reward = formatPrice(cashback);
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
          <p>Bạn được hoàn dự kiến</p>
          <div className={styles.rewardAmountRow}>
            <strong className={reward.length > 9 ? styles.longAmount : ""}>{reward}</strong>
            <span className={styles.ratePill}>Hoàn {cashbackRate.toLocaleString("vi-VN")}%</span>
          </div>
          <span className={styles.rewardTiming}>Nhận sau 14–15 ngày</span>
        </div>
      </div>
      <dl className={styles.priceSummary}>
        <div><dt>Thanh toán</dt><dd>{formatPrice(price)} {originalPrice > price && <s>{formatPrice(originalPrice)}</s>}</dd></div>
        <div><dt>Chi phí sau hoàn</dt><dd className={styles.netCost}>{formatPrice(price - cashback)}</dd></div>
      </dl>
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
