import Image from "next/image";
import Link from "next/link";
import { ListIcon } from "@phosphor-icons/react/dist/ssr/List";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { helpArticles } from "@/lib/content/help";
import s from "../home-support.module.css";

export function HelpHeader() {
  return <header className={s.docsHeader}><div className={s.docsNav}>
    <Link href="/" className={s.docsBrand}><Image src="/brand/deal-hoan-mark.png" width={40} height={40} alt="" /><span>DealHoàn</span></Link>
    <nav aria-label="Điều hướng cẩm nang"><Link href="/#flash">Deal hot</Link><Link href="/docs">Cẩm nang</Link><Link href="/how-to">Cách dùng</Link></nav>
    <details className={s.mobileNav}><summary aria-label="Mở menu cẩm nang"><ListIcon size={22} /></summary><div><Link href="/#flash">Deal hot</Link><Link href="/docs">Cẩm nang</Link><Link href="/how-to">Cách dùng</Link><Link href="/help">Trợ giúp</Link></div></details>
    <Link href="/#cashback-empty-title" className={s.docsStart}>Nhận hoàn tiền <ArrowRightIcon size={16} aria-hidden="true" /></Link>
  </div></header>;
}

export function HelpFooter() {
  return <footer className={s.footer} id="contact"><div className={s.footerInner}>
    <div><Link className={s.footerBrand} href="/"><Image src="/brand/deal-hoan-mark.png" width={40} height={40} alt="" />DealHoàn</Link><p className={s.footerDescription}>Kiểm tra khoản hoàn trước khi mua. Theo dõi đơn và số dư trong cùng một tài khoản.</p></div>
    <nav aria-label="Sàn hỗ trợ"><h3>Sàn hỗ trợ</h3><ul>{[["Shopee","https://shopee.vn"],["ShopeeFood","https://shopeefood.vn"],["TikTok Shop","https://www.tiktok.com/shop"],["Lazada","https://www.lazada.vn"]].map(([label,href])=><li key={label}><a href={href} target="_blank" rel="nofollow noopener noreferrer">{label}</a></li>)}</ul></nav>
    <nav aria-label="Cẩm nang DealHoàn"><h3>Cẩm nang</h3><ul>{helpArticles.filter(a=>a.category==="Cẩm nang").map(a=><li key={a.slug}><Link href={`/${a.slug}`}>{a.title}</Link></li>)}<li><Link href="/#flash">Deal đang có hôm nay</Link></li></ul></nav>
    <nav aria-label="Hỗ trợ DealHoàn"><h3>Hỗ trợ</h3><ul><li><Link href="/help">Trung tâm trợ giúp</Link></li><li><Link href="/how-to">Cách thức hoạt động</Link></li><li><Link href="/docs">Tất cả hướng dẫn</Link></li><li><Link href="/terms">Điều khoản sử dụng</Link></li><li><Link href="/privacy">Chính sách bảo mật</Link></li><li><Link href="/account-deletion">Xóa tài khoản</Link></li><li><Link href="/cach-rut-tien-hoan">Hướng dẫn rút tiền</Link></li><li><Link href="/app">Dùng trên điện thoại</Link></li></ul></nav>
  </div><div className={s.footerBottom}><p>© 2026 DealHoàn · Tiền hoàn dự kiến phụ thuộc điều kiện chương trình và kết quả đối soát của sàn, đối tác.</p></div></footer>;
}
