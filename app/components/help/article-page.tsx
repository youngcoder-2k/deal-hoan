import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { CaretRightIcon } from "@phosphor-icons/react/dist/ssr/CaretRight";
import type { HelpArticle } from "@/lib/content/help";
import { helpArticles } from "@/lib/content/help";
import { HelpHeader, HelpFooter } from "./site-chrome";
import ArticleToc from "./article-toc";
import s from "../home-support.module.css";
export default function ArticlePage({article}:{article:HelpArticle}){
 const related=helpArticles.filter(a=>a.slug!==article.slug&&a.category==="Cẩm nang").slice(0,4);
 return <div className={s.docsPage}><HelpHeader /><main>
  <div className={s.articleHero}><div className={s.articleHeroInner}><nav className={s.breadcrumb} aria-label="Đường dẫn"><Link href="/">Trang chủ</Link><CaretRightIcon size={12} aria-hidden="true" /><Link href="/docs">Cẩm nang</Link><CaretRightIcon size={12} aria-hidden="true" /><span>{article.title}</span></nav><h1>{article.title}</h1><p className={s.articleDescription}>{article.description}</p><span className={s.articleMeta}><ClockCounterClockwiseIcon size={14} aria-hidden="true" /> Cập nhật: 17/10/2026</span></div></div>
  <div className={s.articleBody}><ArticleToc sections={article.sections} /><article className={s.articleContent}>{article.sections.map(section=><section key={section.id} id={section.id}><h2>{section.title}</h2>{section.paragraphs.map(p=><p key={p}>{p}</p>)}</section>)}<div className={s.articleCta}><p>Kiểm tra khoản hoàn của sản phẩm bạn muốn mua.</p><Link href="/#cashback-empty-title" className={s.docsStart}>Dán link ngay <ArrowRightIcon size={17} aria-hidden="true" /></Link></div><section aria-labelledby="related-title"><h2 id="related-title">Bài viết liên quan</h2><div className={s.related}>{related.map(a=><Link href={`/${a.slug}`} key={a.slug}><strong>{a.title}</strong><span>{a.description}</span></Link>)}</div></section><Link className={s.textLink} href="/docs">Về trang cẩm nang <ArrowRightIcon size={17} aria-hidden="true" /></Link></article></div>
 </main><HelpFooter /></div>;
}
