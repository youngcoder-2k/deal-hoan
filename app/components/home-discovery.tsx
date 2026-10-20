"use client";

import { useState } from "react";
import Image from "next/image";
import s from "./home-discovery.module.css";
import HomeSupport from "./home-support";
import journeyPhone from "@/public/home-art/journey-reference/phone.webp";
import journeyShopping from "@/public/home-art/journey-reference/shopping.webp";
import journeyWallet from "@/public/home-art/journey-reference/wallet.webp";
import journeySpark from "@/public/home-art/journey-reference/spark.webp";

const artworks = { journeyPhone, journeyShopping, journeyWallet };

function Artwork({ name, className, sizes }: { name: keyof typeof artworks; className?: string; sizes: string }) {
  const [failed, setFailed] = useState(false);
  return <Image unoptimized src={artworks[name]} alt="" className={className} sizes={sizes} placeholder="blur" onError={() => setFailed(true)} style={failed ? { visibility: "hidden" } : undefined} />;
}

const journey = [
  { artwork: "journeyPhone", title: "Xem khoản hoàn", text: "Dán link vào DealHoàn, xem tiền hoàn trước khi mua." },
  { artwork: "journeyShopping", title: "Mua qua link mới", text: "Đặt hàng và thanh toán trên sàn qua link nhận hoàn mới." },
  { artwork: "journeyWallet", title: "Theo dõi & nhận tiền", text: "Khoản hoàn được duyệt, yêu cầu rút về ngân hàng." },
] as const;

type Props = { onStart: () => void; onAccount: () => void; signedIn: boolean; accountPending: boolean };

export default function HomeDiscovery({ onStart, onAccount, signedIn, accountPending }: Props) {
  return (
    <div className={s.discovery}>
      <section className={s.referenceScene} id="how" aria-labelledby="journey-title">
        <div className={s.referenceInner}>
          <header className={s.referenceHeading}>
            <div data-motion="left">
              <span className={s.referenceEyebrow}>TỪ LINK ĐẾN TIỀN HOÀN</span>
              <h2 id="journey-title">Mua món bạn mê<br /><em>Đón tiền hoàn về</em></h2>
            </div>
            <p data-motion="right">Không đổi cách mua sắm.<br />Chỉ thêm một lần kiểm tra link</p>
          </header>
          <Image unoptimized className={s.referenceSparkLeft} src={journeySpark} alt="" sizes="46px" />
          <Image unoptimized className={s.referenceSparkRight} src={journeySpark} alt="" sizes="46px" />
          <ol className={s.referenceSteps}>
            {journey.map(({ artwork, title, text }, i) => (
              <li key={title} data-motion="rise" data-motion-delay={i * 90}>
                <span className={s.referenceNumber}>0{i + 1}</span>
                <Artwork name={artwork} className={s.referenceObject} sizes="(max-width: 600px) 240px, (max-width: 1000px) 25vw, 286px" />
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <HomeSupport onStart={onStart} onAccount={onAccount} signedIn={signedIn} accountPending={accountPending} />
    </div>
  );
}
