"use client";
import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ListChecksIcon } from "@phosphor-icons/react/dist/csr/ListChecks";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { CurrencyCircleDollarIcon } from "@phosphor-icons/react/dist/csr/CurrencyCircleDollar";
import { StorefrontIcon } from "@phosphor-icons/react/dist/csr/Storefront";
import { ReceiptIcon } from "@phosphor-icons/react/dist/csr/Receipt";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { TicketIcon } from "@phosphor-icons/react/dist/csr/Ticket";
import { QuestionIcon } from "@phosphor-icons/react/dist/csr/Question";
import { ForkKnifeIcon } from "@phosphor-icons/react/dist/csr/ForkKnife";
import { DeviceMobileIcon } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { LightningIcon } from "@phosphor-icons/react/dist/csr/Lightning";
import { featuredHelpSlugs, getHelpArticle } from "@/lib/content/help";
import { HelpFooter } from "./help/site-chrome";
import s from "./home-support.module.css";

const benefits = [
  {Icon:StorefrontIcon,title:"Mua trên sàn quen thuộc",text:"Bạn chọn hàng, thanh toán và nhận hàng từ sàn. DealHoàn hỗ trợ kiểm tra và tạo link nhận hoàn."},
  {Icon:ReceiptIcon,title:"Khoản hoàn minh bạch",text:"Xem giá và mức hoàn dự kiến trước khi mua. Mỗi sản phẩm có điều kiện riêng, không áp một tỷ lệ cho mọi đơn."},
  {Icon:CurrencyCircleDollarIcon,title:"Theo dõi số dư rõ ràng",text:"Phân biệt tiền chờ đối soát và tiền đã duyệt. Yêu cầu rút về ngân hàng khi số dư đủ điều kiện."},
  {Icon:ListChecksIcon,title:"Chủ động trước khi chốt đơn",text:"Đối chiếu sản phẩm, link và điều kiện chương trình. Bạn quyết định mua sau khi đã xem đủ thông tin."},
];
const questions = [
 ["Tiền hoàn của DealHoàn đến từ đâu?","DealHoàn chia lại một phần hoa hồng tiếp thị từ giao dịch hợp lệ. Khoản được duyệt phụ thuộc kết quả xác nhận của sàn và đối tác."],
 ["Tôi cần đăng nhập lúc nào?","Bạn có thể kiểm tra link trước. Hãy đăng nhập trước khi mua để gắn liên kết với tài khoản và theo dõi đơn, số dư."],
 ["Bao nhiêu tiền thì có thể yêu cầu rút?","Mức rút tối thiểu hiện tại là 50.000đ từ số dư đã duyệt. Tiền đang chờ đối soát chưa dùng để rút."],
 ["Đơn hủy hoặc trả hàng có được hoàn không?","Đơn hủy, hoàn trả hoặc không đáp ứng điều kiện chương trình có thể bị loại. Chỉ giao dịch được xác nhận hợp lệ mới có khoản hoàn được duyệt."],
];
const icons=[QuestionIcon,ForkKnifeIcon,TicketIcon,ShieldCheckIcon,DeviceMobileIcon,LightningIcon,ForkKnifeIcon];
type Props={onStart:()=>void;onAccount:()=>void;signedIn:boolean;accountPending:boolean};
export default function HomeSupport({onStart,onAccount,signedIn,accountPending}:Props){
 return <div className={s.support}>
  <section className={s.section} id="benefits" aria-labelledby="benefits-title"><header className={s.heading}><span className={s.eyebrow}>VÌ SAO CHỌN DEALHOÀN?</span><h2 id="benefits-title">Tiền hoàn rõ ràng. Mua sắm nhẹ nhàng.</h2></header><div className={s.grid}>{benefits.map(({Icon,title,text})=><article className={s.card} key={title}><div className={s.benefitHeading}><span className={s.benefitIcon}><Icon size={22} weight="regular" aria-hidden="true" /></span><h3>{title}</h3></div><p>{text}</p></article>)}</div></section>
  <section className={s.section} id="faq" aria-labelledby="faq-title"><header className={s.heading}><span className={s.eyebrow}>CÂU HỎI THƯỜNG GẶP</span><h2 id="faq-title">Bạn hỏi, DealHoàn trả lời.</h2></header><div className={s.faqList}>{questions.map(([q,a],i)=><details key={q} open={i===0}><summary>{q}<PlusIcon size={18} aria-hidden="true" /></summary><div className={s.faqAnswer}><p>{a}</p></div></details>)}</div></section>
  <section className={s.section} id="guides" aria-labelledby="guides-title"><header className={s.heading}><span className={s.eyebrow}>CẨM NANG HOÀN TIỀN</span><h2 id="guides-title">Mẹo nhỏ. Tiết kiệm hơn.</h2></header><div className={s.grid}>{featuredHelpSlugs.map((slug,i)=>{if(slug === "app-hoan-tien-uy-tin") return null;const article=getHelpArticle(slug)!;const Icon=icons[i];return <Link className={s.card} href={`/${slug}`} key={slug}><div className={s.benefitHeading}><span className={`${s.icon} ${i%3===1?s.green:i%3===2?s.orange:""}`}><Icon size={22} weight="fill" aria-hidden="true" /></span><h3>{article.title}</h3></div><p>{article.description}</p></Link>;})}</div><div className={s.guideIndex}><Link className={s.textLink} href="/docs">Xem tất cả hướng dẫn <ArrowRightIcon size={18} aria-hidden="true" /></Link></div></section>
  <section className={s.cta} aria-labelledby="start-title"><h2 id="start-title">Link đầu tiên của bạn đâu?</h2><p>Dán link sản phẩm, xem khoản hoàn dự kiến trước khi mua.</p><div className={s.ctaActions}><button type="button" className={`${s.button} ${s.whiteButton}`} onClick={onAccount} disabled={accountPending}>{accountPending?"Đang mở…":signedIn?"Mở tài khoản của tôi":"Đăng nhập để theo dõi đơn"}</button><button type="button" className={`${s.button} ${s.outlineButton}`} onClick={onStart}>Dán link đầu tiên <ArrowRightIcon size={18} aria-hidden="true" /></button></div></section>
  <HelpFooter />
 </div>;
}
