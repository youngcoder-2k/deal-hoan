"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { WalletIcon } from "@phosphor-icons/react/dist/csr/Wallet";
import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { LinkIcon } from "@phosphor-icons/react/dist/csr/Link";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import s from "./home-discovery.module.css";
import linkArtwork from "@/public/home-art/link-v2.webp";
import shoppingArtwork from "@/public/home-art/shopping-v2.webp";
import walletArtwork from "@/public/home-art/wallet-v2.webp";
import helpArtwork from "@/public/home-art/help-v2.webp";
import journeyPhone from "@/public/home-art/journey/phone.webp";
import journeyShopping from "@/public/home-art/journey/shopping.webp";
import journeyWallet from "@/public/home-art/journey/wallet.webp";
import journeyUnderline from "@/public/home-art/journey/underline.webp";

const artworks = { link: linkArtwork, shopping: shoppingArtwork, wallet: walletArtwork, help: helpArtwork, journeyPhone, journeyShopping, journeyWallet };

function Artwork({ name, className, sizes }: { name: keyof typeof artworks; className?: string; sizes: string }) {
  const [failed, setFailed] = useState(false);
  return <Image src={artworks[name]} alt="" className={className} sizes={sizes} placeholder="blur" onError={() => setFailed(true)} style={failed ? { visibility: "hidden" } : undefined} />;
}

const journey = [
  { artwork: "journeyPhone", title: "Xem khoản hoàn", text: "Sao chép link từ sàn, dán vào DealHoàn để xem giá và tiền hoàn dự kiến." },
  { artwork: "journeyShopping", title: "Mua qua link mới", text: "Bấm Mua ngay từ kết quả. Bạn vẫn đặt hàng và thanh toán trực tiếp trên sàn." },
  { artwork: "journeyWallet", title: "Theo dõi & nhận tiền", text: "Xem đơn trong tài khoản. Khi khoản hoàn được duyệt, bạn có thể yêu cầu rút về ngân hàng." },
] as const;

const benefits = [
  { icon: EyeIcon, title: "Biết trước, mua chủ động", text: "Giá mua, khoản hoàn dự kiến và chi phí sau hoàn nằm cùng một chỗ, dễ so sánh trước khi quyết định." },
  { icon: ShieldCheckIcon, title: "Mua trên sàn quen thuộc", text: "DealHoàn tạo liên kết nhận hoàn. Việc chọn hàng, thanh toán và giao nhận vẫn diễn ra trên sàn." },
  { icon: WalletIcon, title: "Không lẫn tiền chờ và tiền có", text: "Theo dõi trạng thái từng đơn và số dư được duyệt trong tài khoản, trước khi gửi yêu cầu rút." },
];

const guides = [
  { artwork: "link", tag: "BẮT ĐẦU", title: "Lấy link đúng, nhận hoàn dễ hơn", brief: "Một thao tác nhỏ trước mỗi lần mua.", body: ["Mở sản phẩm trên Shopee, TikTok Shop hoặc Lazada. Chọn Chia sẻ, rồi Sao chép liên kết.", "Dán liên kết vào ô đầu trang và bấm Tính. Kiểm tra đúng sản phẩm, giá và khoản hoàn dự kiến.", "Dùng nút Mua ngay hoặc link mới trong kết quả để tiếp tục mua trên sàn."] },
  { artwork: "shopping", tag: "MẸO TIẾT KIỆM", title: "Săn mã, rồi kiểm tra tiền hoàn", brief: "Nhìn cả giá thanh toán lẫn khoản nhận lại.", body: ["Kiểm tra voucher và phí vận chuyển trên sàn trước khi thanh toán. Mỗi mã có điều kiện sử dụng riêng.", "Khoản hoàn hiển thị là dự kiến; giá trị cuối cùng phụ thuộc giá trị đơn hợp lệ và kết quả đối soát.", "Sau khi mở link nhận hoàn, tránh bấm thêm link, banner hoặc video tiếp thị khác trước khi đặt hàng."] },
  { artwork: "wallet", tag: "HIỂU TIỀN HOÀN", title: "Từ đơn mua đến số dư được duyệt", brief: "Phân biệt ghi nhận, chờ duyệt và được rút.", body: ["Đăng nhập để theo dõi đơn hàng và ví trong tài khoản DealHoàn.", "Đơn được ghi nhận chưa đồng nghĩa tiền đã được duyệt. Sàn và đối tác cần xác nhận đơn hợp lệ.", "Đơn hủy hoặc hoàn trả không được hoàn tiền. Yêu cầu rút chỉ sử dụng số dư đã được duyệt, từ 50.000đ."] },
] as const;

const questions = [
  ["Tiền hoàn đến từ đâu?", "DealHoàn chia sẻ lại một phần hoa hồng tiếp thị nhận được từ đơn mua hợp lệ. Mức hoàn dự kiến được hiển thị trước khi bạn mở link mua hàng."],
  ["Có phải sản phẩm nào cũng được hoàn như nhau?", "Không. Mức hoàn thay đổi theo sản phẩm, sàn và chương trình tại thời điểm kiểm tra. Hãy dùng kết quả của link bạn vừa dán, thay vì áp dụng mức hoàn của một sản phẩm khác."],
  ["Tôi cần đăng nhập lúc nào?", "Bạn có thể kiểm tra link trước. Hãy đăng nhập trước khi mua để hệ thống gắn liên kết với tài khoản và bạn có thể theo dõi đơn, số dư và yêu cầu rút."],
  ["Khi nào tiền được rút về ngân hàng?", "Bạn gửi yêu cầu rút khi số dư được duyệt đạt từ 50.000đ. Tiền chờ đối soát chưa thể rút; thời gian duyệt phụ thuộc sàn và đối tác."],
  ["Vì sao khoản hoàn cuối cùng có thể thay đổi?", "Giá trị thanh toán thực tế, điều kiện chương trình, đơn hủy hoặc hoàn trả có thể ảnh hưởng đến khoản hoàn. Số tiền được duyệt dựa trên kết quả xác nhận của sàn và đối tác."],
  ["Làm gì để tránh mất ghi nhận đơn?", "Mua qua link mới DealHoàn tạo cho bạn, không bấm thêm liên kết tiếp thị khác sau đó, không dùng trình duyệt ẩn danh và không xóa sản phẩm đã thêm vào giỏ từ link nhận hoàn."],
];

type Props = { onStart: () => void; onAccount: () => void; signedIn: boolean; accountPending: boolean };

export default function HomeDiscovery({ onStart, onAccount, signedIn, accountPending }: Props) {
  return (
    <div className={s.discovery}>
      <section className={s.journeyScene} id="how" aria-labelledby="journey-title">
        <div className={s.journeyInner}>
          <header className={s.journeyIntro}>
            <span className={s.journeyEyebrow}><span><LinkIcon weight="bold" aria-hidden="true" /></span>TỪ LINK ĐẾN TIỀN HOÀN</span>
            <h2 id="journey-title">Mua món bạn mê.<br /><em>Đón tiền hoàn về.<Image src={journeyUnderline} alt="" className={s.journeyUnderline} sizes="(max-width: 700px) 300px, 500px" /></em></h2>
            <p>Không đổi cách mua sắm.<br />Chỉ thêm một lần kiểm tra link.</p>
          </header>
          <ol className={s.journeySteps}>
            {journey.map(({ artwork, title, text }, i) => (
              <li key={title}>
                <span className={s.journeyNumber}>0{i + 1}</span>
                <h3>{title}</h3><p>{text}</p>
                <Artwork name={artwork} className={s.journeyObject} sizes="(max-width: 700px) 32vw, (max-width: 1100px) 30vw, 340px" />
                {i < journey.length - 1 && <CaretRightIcon className={s.journeyConnector} weight="bold" aria-hidden="true" />}
              </li>
            ))}
          </ol>
          <button className={s.journeyCta} onClick={onStart}>Thử với link của bạn <ArrowRightIcon weight="bold" aria-hidden="true" /></button>
        </div>
      </section>

      <section className={s.benefitsSection} id="benefits" aria-labelledby="benefits-title">
        <div className={s.benefitsInner}>
          <div className={s.benefitIntro}>
            <span className={s.eyebrow}>VÌ SAO CHỌN DEALHOÀN?</span>
            <h2 id="benefits-title">Tiền hoàn rõ ràng.<br /><em>Mua sắm nhẹ nhàng.</em></h2>
            <p>Điều quan trọng không chỉ là hoàn bao nhiêu, mà còn là bạn hiểu khoản hoàn của mình.</p>
            <div className={s.walletScene}>
              <Artwork name="wallet" className={s.walletArtwork} sizes="(max-width: 480px) 300px, (max-width: 760px) 320px, 340px" />
              <div className={s.walletPreview} aria-label="Minh họa trạng thái tiền hoàn">
              <div><WalletIcon size={24} aria-hidden="true" /><b>Ví tiền hoàn của bạn</b><span>Minh họa</span></div>
              <p><span className={s.waitDot} />Chờ xác nhận <small>Đang đối soát với sàn</small></p>
              <p><span className={s.doneDot} />Đã duyệt <small>Sẵn sàng yêu cầu rút</small></p>
              </div>
            </div>
          </div>
          <div className={s.benefitList}>
            {benefits.map(({ icon: Icon, title, text }) => <article key={title}><span className={s.icon}><Icon size={28} weight="duotone" aria-hidden="true" /></span><div><h3>{title}</h3><p>{text}</p></div></article>)}
          </div>
        </div>
      </section>

      <section className={s.section} id="guides" aria-labelledby="guides-title">
        <header className={`${s.heading} ${s.headingLeft}`}><span className={s.eyebrow}>CẨM NANG MUA KHÉO</span><h2 id="guides-title">Mẹo nhỏ. <em>Tiết kiệm hơn.</em></h2><p>Hiểu cách dùng trước khi chốt đơn đầu tiên.</p></header>
        <div className={s.guides}>
          {guides.map(({ artwork, tag, title, brief, body }) => (
            <details className={s.guide} key={title}>
              <summary><span className={s.guideArtwork}><Artwork name={artwork} sizes="(max-width: 480px) calc(100vw - 32px), (max-width: 760px) calc(100vw - 40px), (max-width: 1000px) 30vw, 378px" /></span><span className={s.guideTag}>{tag}</span><h3>{title}</h3><p>{brief}</p><span className={s.readGuide}>Đọc hướng dẫn <ArrowRightIcon aria-hidden="true" /></span></summary>
              <ol>{body.map(text => <li key={text}>{text}</li>)}</ol>
            </details>
          ))}
        </div>
      </section>

      <section className={`${s.section} ${s.faqSection}`} id="faq" aria-labelledby="faq-title">
        <header className={`${s.heading} ${s.headingLeft}`}><span className={s.eyebrow}>GIẢI ĐÁP NHANH</span><h2 id="faq-title">Bạn hỏi,<br /><em>DealHoàn trả lời.</em></h2><p>Những điều nên biết để mua sắm chủ động hơn.</p><Artwork name="help" className={s.faqArtwork} sizes="(max-width: 480px) 210px, (max-width: 760px) 180px, 265px" /><Link href="/terms" className={s.textAction}>Xem điều khoản <ArrowRightIcon aria-hidden="true" /></Link></header>
        <div className={s.faqList}>{questions.map(([q, a]) => <details key={q}><summary>{q}<PlusIcon size={20} aria-hidden="true" /></summary><p>{a}</p></details>)}</div>
      </section>

      <section className={`${s.section} ${s.startBanner}`} aria-labelledby="start-title">
        <Artwork name="shopping" className={s.bannerArtwork} sizes="(max-width: 480px) 190px, (max-width: 760px) 130px, (max-width: 1000px) 145px, 190px" />
        <div><span className={s.bannerEyebrow}>MÓN BẠN THÍCH, KHOẢN HOÀN BẠN BIẾT</span><h2 id="start-title">Link đầu tiên của bạn đâu?</h2><p>Dán vào DealHoàn, xem khoản hoàn trước khi mua.</p></div>
        <div className={s.bannerActions}><button className={s.whiteButton} onClick={onStart}>Tính tiền hoàn <ArrowRightIcon aria-hidden="true" /></button><button className={s.accountButton} disabled={accountPending} onClick={onAccount}>{accountPending ? "Đang mở…" : signedIn ? "Mở ví của tôi" : "Đăng nhập để theo dõi đơn"}</button></div>
      </section>

      <footer className={s.footer} id="contact">
        <div className={s.footerInner}><div className={s.footerBrand}><b>Deal<span>Hoàn</span></b><p>Săn món bạn thích.<br />Giữ lại nhiều hơn cho mình.</p><span>Shopee · TikTok Shop · Lazada</span></div><nav aria-label="Khám phá DealHoàn"><h3>Khám phá</h3><a href="#flash">Deal đang có</a><a href="#how">Cách nhận hoàn</a><a href="#guides">Cẩm nang mua khéo</a></nav><nav aria-label="Tài khoản và hỗ trợ"><h3>Đồng hành cùng bạn</h3><button disabled={accountPending} onClick={onAccount}>{signedIn ? "Tài khoản & ví tiền" : "Đăng nhập tài khoản"}</button><a href="#faq">Câu hỏi thường gặp</a><Link href="/terms">Điều khoản sử dụng</Link><Link href="/privacy">Chính sách bảo mật</Link></nav></div>
        <div className={s.footerBottom}><span>© 2026 DealHoàn</span><span>Khoản hoàn dự kiến phụ thuộc điều kiện và đối soát của sàn.</span></div>
      </footer>
    </div>
  );
}
