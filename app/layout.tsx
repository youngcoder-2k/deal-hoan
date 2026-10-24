import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import ScrollToTop from "@/app/components/scroll-to-top";
import ServiceWorkerRegister from "@/app/components/sw-register";
import PwaInstallPrompt from "@/app/components/pwa-install-prompt";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-app",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#faf3ef",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://deal-hoan.vercel.app"),
  title: "DealHoàn — Săn deal & hoàn tiền",
  description: "Nền tảng săn deal và hoàn tiền cho người mua sắm thông minh.",
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: "DealHoàn",
    title: "DealHoàn — Săn deal & hoàn tiền",
    description: "Nền tảng săn deal và hoàn tiền cho người mua sắm thông minh.",
    images: [
      {
        url: "/brand/deal-hoan-logo.png",
        width: 1536,
        height: 1024,
        alt: "DealHoàn — Săn deal · Hoàn tiền",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DealHoàn — Săn deal & hoàn tiền",
    description: "Nền tảng săn deal và hoàn tiền cho người mua sắm thông minh.",
    images: ["/brand/deal-hoan-logo.png"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DealHoàn",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/apple-icon.png" },
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ScrollToTop />
        <ServiceWorkerRegister />
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
