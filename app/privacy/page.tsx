import type { Metadata } from "next";
import ArticlePage from "@/app/components/help/article-page";
import { getHelpArticle } from "@/lib/content/help";
const article = getHelpArticle("chinh-sach-bao-mat")!;
export const metadata: Metadata = { title: `${article.title} | DealHoàn`, description: article.description, alternates: { canonical: "/privacy" } };
export default function Page() { return <ArticlePage article={article} />; }
