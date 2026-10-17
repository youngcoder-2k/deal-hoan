"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { LinkIcon } from "@phosphor-icons/react/dist/csr/Link";
import s from "./home-discovery.module.css";
import HomeSupport from "./home-support";
import journeyPhone from "@/public/home-art/journey/phone.webp";
import journeyShopping from "@/public/home-art/journey/shopping.webp";
import journeyWallet from "@/public/home-art/journey/wallet.webp";
import journeyUnderline from "@/public/home-art/journey/underline.webp";

const artworks = { journeyPhone, journeyShopping, journeyWallet };

function Artwork({ name, className, sizes }: { name: keyof typeof artworks; className?: string; sizes: string }) {
  const [failed, setFailed] = useState(false);
  return <Image src={artworks[name]} alt="" className={className} sizes={sizes} placeholder="blur" onError={() => setFailed(true)} style={failed ? { visibility: "hidden" } : undefined} />;
}

const journey = [
  { artwork: "journeyPhone", title: "Xem tiền hoàn", text: "Dán link, xem\nhoàn dự kiến." },
  { artwork: "journeyShopping", title: "Mua qua link mới", text: "Thanh toán\ntrên sàn." },
  { artwork: "journeyWallet", title: "Nhận tiền hoàn", text: "Tiền duyệt,\nrút ngân hàng." },
] as const;

type Props = { onStart: () => void; onAccount: () => void; signedIn: boolean; accountPending: boolean };

export default function HomeDiscovery({ onStart, onAccount, signedIn, accountPending }: Props) {
  return (
    <div className={s.discovery}>
      <section className={s.journeyScene} id="how" aria-labelledby="journey-title">
        <div className={s.journeyInner}>
          <header className={s.journeyIntro}>
            <span className={s.journeyEyebrow}><span><LinkIcon weight="bold" aria-hidden="true" /></span>TỪ LINK ĐẾN TIỀN HOÀN</span>
            <h2 id="journey-title">Mua món bạn mê.<br /><em>Đón tiền hoàn về.<Image src={journeyUnderline} alt="" className={s.journeyUnderline} sizes="(max-width: 700px) 300px, 500px" /></em></h2>
            <p>Dán link. Mua sắm. Nhận hoàn.</p>
          </header>
          <ol className={s.journeySteps}>
            {journey.map(({ artwork, title, text }, i) => (
              <li key={title}>
                <span className={s.journeyNumber}>0{i + 1}</span>
                <h3>{title}</h3><p>{text}</p>
                <Artwork name={artwork} className={s.journeyObject} sizes="(max-width: 700px) 32vw, (max-width: 1100px) 30vw, 340px" />
                {i < journey.length - 1 && <ArrowRightIcon className={s.journeyConnector} weight="bold" aria-hidden="true" />}
              </li>
            ))}
          </ol>
          <button className={s.journeyCta} onClick={onStart}>Thử với link của bạn <ArrowRightIcon weight="bold" aria-hidden="true" /></button>
        </div>
      </section>

      <HomeSupport onStart={onStart} onAccount={onAccount} signedIn={signedIn} accountPending={accountPending} />
    </div>
  );
}
