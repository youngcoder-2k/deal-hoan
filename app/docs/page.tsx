import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenTextIcon } from "@phosphor-icons/react/dist/ssr/BookOpenText";
import { helpArticles } from "@/lib/content/help";
import { HelpHeader, HelpFooter } from "../components/help/site-chrome";
import s from "../components/home-support.module.css";
export const metadata:Metadata={title:"Cẩm nang và trợ giúp | DealHoàn",description:"Hướng dẫn kiểm tra link, mua hàng, theo dõi và rút tiền hoàn trên DealHoàn.",alternates:{canonical:"/docs"}};
export default function DocsPage(){return <div className={s.docsPage}><HelpHeader /><main><div className={s.articleHero}><div className={s.articleHeroInner}><nav className={s.breadcrumb} aria-label="Đường dẫn"><Link href="/">Trang chủ</Link><span>/</span><span>Cẩm nang</span></nav><h1>Cẩm nang & trợ giúp</h1><p className={s.articleDescription}>Hiểu cách mua qua link, theo dõi đơn và sử dụng tiền hoàn.</p></div></div><div className={s.hub}>{["Cẩm nang","Hỗ trợ","Chính sách"].map(category=><section className={s.hubSection} key={category}><h2>{category}</h2><div className={s.grid}>{helpArticles.filter(a=>a.category===category).map(a=><Link href={`/${a.slug}`} className={s.card} key={a.slug}><span className={s.icon}><BookOpenTextIcon size={26} weight="fill" aria-hidden="true" /></span><h3>{a.title}</h3><p>{a.description}</p></Link>)}</div></section>)}</div></main><HelpFooter /></div>;}
