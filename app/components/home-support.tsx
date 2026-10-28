"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import storyPhone from "@/public/home-art/support-refresh/phone-reference-v4.webp";
import { HelpFooter } from "./help/site-chrome";
import s from "./home-support-refresh.module.css";

type Props = { onStart: () => void; onAccount: () => void; signedIn: boolean; accountPending: boolean };
const art = "/home-art/support-refresh/";
const guides = [
  { image: "guide-start-retina-v3.webp", category: "BẮT ĐẦU", title: "Lấy link đúng, nhận hoàn dễ hơn", description: "Một thao tác nhỏ trước mỗi lần mua.", href: "/how-to", alt: "Kiểm tra tiền hoàn trên điện thoại" },
  { image: "guide-saving-retina-v3.webp", category: "MẸO TIẾT KIỆM", title: "Săn sale khéo, mua sắm hời hơn", description: "Kết hợp mã giảm giá và khoản hoàn.", href: "/cach-san-sale-shopee", alt: "Ống tiết kiệm và những đồng tiền vàng" },
  { image: "guide-cashback-retina-v3.webp", category: "HIỂU TIỀN HOÀN", title: "Hiểu khoản hoàn, an tâm chốt đơn", description: "Phân biệt tiền dự kiến và tiền đã duyệt.", href: "/cashback-shopee-la-gi", alt: "Mua sắm thông minh và quản lý khoản hoàn" },
];
const questions = [
  ["Tiền hoàn của DealHoàn đến từ đâu?", "DealHoàn lấy từ phần tiền Affiliate của Shopee. Chúng tôi gửi cho bạn phần lớn và chỉ giữ lại một phần nhỏ để duy trì website."],
  ["Tôi có cần đăng nhập trước khi mua?", "Bạn có thể kiểm tra link trước. Hãy đăng nhập trước khi mua để gắn liên kết với tài khoản và theo dõi đơn, số dư."],
  ["Khoản hoàn dự kiến có phải số tiền cuối cùng?", "Chưa. Mức hoàn dự kiến giúp bạn tham khảo trước khi mua. Khoản thực nhận phụ thuộc giá trị thanh toán hợp lệ, điều kiện chương trình và kết quả đối soát."],
  ["Khi nào tôi có thể rút tiền hoàn?", "Sau khi đơn được đối soát và khoản hoàn được duyệt, bạn có thể yêu cầu rút về ngân hàng khi số dư đã duyệt đạt tối thiểu 10.000đ."],
  ["Đơn hủy hoặc trả hàng có được hoàn không?", "Đơn hủy, hoàn trả hoặc không đáp ứng điều kiện chương trình có thể bị loại. Chỉ giao dịch được xác nhận hợp lệ mới có khoản hoàn được duyệt."],
  ["Mua qua link nào để được ghi nhận?", "Dùng nút Mua ngay hoặc link nhận hoàn mới được tạo từ kết quả của bạn. Đọc lưu ý trước khi mua và hoàn tất đặt hàng trên sàn."],
];

export default function HomeSupport({ onStart, onAccount, signedIn, accountPending }: Props) {
  const guideTrack = useRef<HTMLDivElement>(null);
  const [activeGuide, setActiveGuide] = useState(0);
  const guideTrackId = useId();
  const syncActiveGuide = useCallback(() => {
    const track = guideTrack.current;
    if (!track) return;
    if (track.scrollWidth <= track.clientWidth) { setActiveGuide(0); return; }
    const cards = Array.from(track.querySelectorAll<HTMLAnchorElement>("a"));
    const left = track.getBoundingClientRect().left;
    let closest = 0;
    cards.forEach((card, index) => {
      if (Math.abs(card.getBoundingClientRect().left - left) < Math.abs(cards[closest].getBoundingClientRect().left - left)) closest = index;
    });
    setActiveGuide(closest);
  }, []);
  useEffect(() => {
    const track = guideTrack.current;
    if (!track) return;
    const observer = new ResizeObserver(syncActiveGuide);
    observer.observe(track);
    return () => observer.disconnect();
  }, [syncActiveGuide]);
  const showGuide = (index: number, focusCard = false) => {
    const track = guideTrack.current;
    const next = Math.max(0, Math.min(index, guides.length - 1));
    const card = track?.querySelectorAll<HTMLAnchorElement>("a")[next];
    if (!track || !card) return;
    track.scrollTo({ left: track.scrollLeft + card.getBoundingClientRect().left - track.getBoundingClientRect().left, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    if (focusCard) card.focus({ preventScroll: true });
  };
  return <div className={s.refresh}>
    <section id="benefits" aria-labelledby="benefits-title" className={s.story}>
      <div className={s.storyCopy} data-motion="left">
        <h2 id="benefits-title">Tiền hoàn rõ ràng<span>Mua sắm nhẹ nhàng</span></h2>
        <p className={s.lead}>Điều quan trọng không chỉ là hoàn bao nhiêu,<br className={s.desktopBreak} /> mà còn là bạn hiểu khoản hoàn của mình.</p>
        <div className={s.storyActions}>
          <button type="button" className={s.storyPrimary} onClick={onStart}>Trải nghiệm ngay <ArrowRightIcon size={20} aria-hidden="true" /></button>
          <Link className={s.storySecondary} href="/how-to">Cách nhận hoàn <ArrowRightIcon size={20} aria-hidden="true" /></Link>
        </div>
        <p className={s.webNote}>Dùng ngay trên website, không cần cài đặt.</p>
      </div>
      <div className={s.storyVisual} data-motion="right" data-motion-delay="120">
        <Image unoptimized src={storyPhone} className={s.phone} alt="Minh hoạ DealHoàn trên điện thoại: biết trước khoản hoàn, mua trên sàn quen thuộc, theo dõi tiền chờ xác nhận và đã duyệt." sizes="(max-width: 767px) 100vw, 55vw" placeholder="blur" />
      </div>
    </section>

    <section id="guides" aria-labelledby="guides-title" className={s.guides}>
      <header className={s.guideHeading} data-motion="rise"><div><span className={s.eyebrow}>CẨM NANG MUA KHÉO</span><h2 id="guides-title">Mẹo nhỏ<span>Tiết kiệm hơn</span></h2></div><Link href="/docs" className={s.secondary}>Tất cả cẩm nang <ArrowRightIcon size={18} aria-hidden="true" /></Link></header>
      <div id={guideTrackId} ref={guideTrack} className={s.guideGrid} role="group" aria-label="Các bài cẩm nang mua sắm" onScroll={syncActiveGuide} onKeyDown={event => {
        if (!window.matchMedia("(max-width: 767px)").matches) return;
        const focused = Array.from(guideTrack.current?.querySelectorAll("a") || []).indexOf(event.target as HTMLAnchorElement);
        const next = event.key === "ArrowRight" ? focused + 1 : event.key === "ArrowLeft" ? focused - 1 : event.key === "Home" ? 0 : event.key === "End" ? guides.length - 1 : null;
        if (next !== null) { event.preventDefault(); showGuide(next, true); }
      }}>{guides.map((guide, index) => <Link data-motion="rise" data-motion-delay={index * 90} key={guide.href} href={guide.href} className={s.guideCard}>
        <div className={s.guideImage}><Image unoptimized src={`${art}${guide.image}`} alt={guide.alt} fill sizes="(max-width: 767px) 78vw, (max-width: 1000px) 45vw, 30vw" /></div>
        <div className={s.guideBody}><span className={s.category}>{guide.category}</span><h3>{guide.title}</h3><p>{guide.description}</p><span className={s.readMore}>Đọc hướng dẫn <ArrowRightIcon size={20} aria-hidden="true" /></span></div>
      </Link>)}</div>
      <nav className={s.guideControls} aria-label="Chuyển bài cẩm nang">
        <button type="button" aria-label="Cẩm nang trước" aria-controls={guideTrackId} disabled={activeGuide === 0} onClick={() => showGuide(activeGuide - 1)}><ArrowRightIcon className={s.previousArrow} size={21} aria-hidden="true" /></button>
        <div className={s.guideDots}>{guides.map((guide, index) => <button key={guide.href} type="button" aria-label={`Xem cẩm nang ${index + 1}: ${guide.title}`} aria-controls={guideTrackId} aria-current={activeGuide === index ? "true" : undefined} onClick={() => showGuide(index)}><span /></button>)}</div>
        <button type="button" aria-label="Cẩm nang tiếp theo" aria-controls={guideTrackId} disabled={activeGuide === guides.length - 1} onClick={() => showGuide(activeGuide + 1)}><ArrowRightIcon size={21} aria-hidden="true" /></button>
      </nav>
      <div className={s.guideFooter}><Link href="/docs" className={s.secondary}>Tất cả cẩm nang <ArrowRightIcon size={18} aria-hidden="true" /></Link></div>
    </section>

    <section id="faq" aria-labelledby="faq-title" className={s.faq}>
      <div className={s.faqIntro} data-motion="left"><span className={s.eyebrow}>GIẢI ĐÁP NHANH</span><h2 id="faq-title">Bạn hỏi,<span>DealHoàn trả lời</span></h2><p className={s.lead}>Những điều nên biết để mua sắm chủ động hơn.</p><Image src={`${art}faq-chat.webp`} alt="" width={480} height={480} sizes="(max-width: 767px) 130px, 280px" data-motion-art className={s.chatArt} /><Link href="/terms" className={s.termsLink}>Xem điều khoản <ArrowRightIcon size={20} aria-hidden="true" /></Link></div>
      <div className={s.faqList}>{questions.map(([question, answer], index) => <details data-motion="rise" data-motion-delay={Math.min(index * 55, 165)} key={question}><summary>{question}<PlusIcon size={22} weight="bold" aria-hidden="true" /></summary><div className={s.answer}><p>{answer}</p></div></details>)}<Link href="/help" className={s.helpLink}>Xem trung tâm trợ giúp <ArrowRightIcon size={18} aria-hidden="true" /></Link></div>
    </section>

    <section data-motion="zoom" aria-labelledby="start-title" className={s.cta}>
      <Image src={`${art}cashback-pouch.webp`} alt="" width={400} height={400} sizes="(max-width: 767px) 140px, 220px" data-motion-art className={s.pouch} />
      <div className={s.ctaCopy}><span className={s.eyebrow}>MÓN BẠN THÍCH, KHOẢN HOÀN BẠN BIẾT</span><h2 id="start-title">Link đầu tiên của bạn đâu?</h2><p>Dán vào DealHoàn, xem khoản hoàn trước khi mua.</p></div>
      <div className={s.ctaActions}><button type="button" className={s.primary} onClick={onStart}>Tính tiền hoàn <ArrowRightIcon size={20} aria-hidden="true" /></button><button type="button" className={s.accountLink} onClick={onAccount} disabled={accountPending}>{accountPending ? "Đang mở…" : signedIn ? "Theo dõi đơn của tôi" : "Đăng nhập để theo dõi đơn"}</button></div>
    </section>
    <HelpFooter />
  </div>;
}
