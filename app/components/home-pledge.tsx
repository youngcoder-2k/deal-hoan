import Image from "next/image";
import styles from "./home-pledge.module.css";
import price from "@/public/home-art/pledge/price.webp";
import voucher from "@/public/home-art/pledge/voucher.webp";
import account from "@/public/home-art/pledge/account.webp";

const promises = [
  { image: price, title: "Không tăng giá", text: "Giá sản phẩm trên sàn không đổi." },
  { image: voucher, title: "Không mất ưu đãi", text: "Giữ mã Freeship, Voucher Shopee/TikTok và Xu có sẵn của bạn." },
  { image: account, title: "Không hỏi mật khẩu", text: "Không yêu cầu mật khẩu tài khoản mua hàng." },
];

export default function HomePledge() {
  return (
    <section id="commitments" className={styles.section} aria-labelledby="pledge-title">
      <div className={styles.inner}>
        <div className={styles.intro} data-motion="left">
          <p className={styles.eyebrow}>CAM KẾT CỦA DEALHOÀN</p>
          <h2 id="pledge-title" className={styles.title} aria-label="Cam kết 3 Không">
            <span className={styles.number}>3</span><span className={styles.word}>KHÔNG</span>
          </h2>
          <p className={styles.tagline}>Mua sắm an tâm.<span>Quyền lợi vẹn nguyên.</span></p>
        </div>
        <ul className={styles.list}>
          {promises.map(({ image, title, text }, index) => (
            <li key={title} className={styles.row} data-motion="rise" data-motion-delay={index * 70}>
              <Image unoptimized src={image} alt="" className={styles.art} sizes="(max-width: 767px) 90px, (max-width: 1100px) 160px, 250px" />
              <div><h3>{title}</h3><p>{text}</p></div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
