import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getHelpArticle, helpArticles } from "@/lib/content/help";
import ArticlePage from "@/app/components/help/article-page";
type Props={params:Promise<{slug:string}>};
export function generateStaticParams(){return helpArticles.map(({slug})=>({slug}));}
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {slug}=await params;const article=getHelpArticle(slug);if(!article)return {title:"Không tìm thấy bài viết | DealHoàn"};
 return {title:`${article.title} | DealHoàn`,description:article.description,alternates:{canonical:`/${slug}`},openGraph:{title:`${article.title} | DealHoàn`,description:article.description,url:`/${slug}`,type:"article"}};
}
export default async function Page({params}:Props){const {slug}=await params;const article=getHelpArticle(slug);if(!article)notFound();return <ArticlePage key={article.slug} article={article} />;}
