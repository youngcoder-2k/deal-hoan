"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ticket, CaretRight, X, Copy, Check } from "@phosphor-icons/react";
import type { CalculatedProduct } from "@/lib/deals/resolve";
import s from "./coupon-sheet.module.css";
type Props = { vouchers: NonNullable<CalculatedProduct["matchedVouchers"]>; copiedCode: string | null; onCopy: (code: string) => void };
export default function CouponSheet({ vouchers, copiedCode, onCopy }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const available = vouchers.filter(v => !v.isSlotExhausted);
  useEffect(() => {
    if (!mounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [mounted]);
  if (!available.length) return null;
  const close = () => dialog.current?.close();
  return <>
    <button type="button" className={s.launcher} aria-haspopup="dialog" onClick={() => { setExpanded(false); setMounted(true); }}><Ticket size={26} /><span><strong>Mã giảm giá Shopee</strong><small>{available.length} mã</small></span><CaretRight size={20} /></button>
    {mounted && createPortal(<dialog className={s.dialog} aria-labelledby={title} ref={node => { dialog.current = node; if (node && !node.open) node.showModal(); }} onClose={() => setMounted(false)} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className={s.panel}>
        <div className={s.handle} />
        <header className={s.header}><div><h2 id={title}>Mã giảm giá Shopee</h2><p>{available.length} mã</p></div><button type="button" onClick={close} aria-label="Đóng mã giảm giá" autoFocus><X size={22} /></button></header>
        <div className={s.list}>{(expanded ? available : available.slice(0,3)).map((v,i) => <article className={s.row} key={`${v.coupon.code}-${i}`}>
          <div className={s.info}><h3>{v.coupon.title.replace(/^Mã (giảm giá|ưu đãi) Shopee:\s*/i, "")}</h3><p>{v.isApplicable ? v.coupon.condition : v.reason || v.coupon.condition}</p><code>{v.coupon.code}</code></div>
          <button type="button" disabled={!v.isApplicable} className={s.copy} onClick={() => onCopy(v.coupon.code)}>{copiedCode === v.coupon.code ? <Check size={17} /> : <Copy size={17} />}<span>{copiedCode === v.coupon.code ? "Đã sao chép" : "Sao chép mã"}</span></button>
        </article>)}</div>
        {!expanded && available.length > 3 && <button type="button" className={s.more} onClick={() => setExpanded(true)}>Xem thêm {available.length - 3} mã <CaretRight size={16} /></button>}
        <p className={s.note} role="status">{copiedCode ? "Đã sao chép mã. Kiểm tra điều kiện trên Shopee." : "Kiểm tra điều kiện trên Shopee."}</p>
      </div>
    </dialog>, document.body)}
  </>;
}
