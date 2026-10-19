import HomeClient from "./home-client";
import { getDeals, getActiveFlashSaleSession, getVouchers } from "@/lib/deals";
import { SEED_FLASH } from "@/lib/deals/seed";
import { pickFlash } from "@/lib/deals/select-flash";

export default async function Home() {
  const [deals, flashSession, vouchers] = await Promise.all([
    getDeals(),
    getActiveFlashSaleSession().catch(() => null),
    getVouchers().catch(() => []),
  ]);

  const rawFlash = Array.isArray(deals?.flash) && deals.flash.length > 0 ? deals.flash : pickFlash(SEED_FLASH);
  const validFlash = rawFlash.filter((d) => d.price > 0 && d.price <= 1_500_000);
  const finalFlash = validFlash.length > 0 ? validFlash : pickFlash(SEED_FLASH);

  return (
    <HomeClient
      flashDeals={finalFlash}
      hotDeals={deals?.hot || []}
      vouchers={vouchers}
      source={deals?.source || "live"}
      flashEndTime={flashSession?.endTime ? flashSession.endTime * 1000 : undefined}
      flashSlot={flashSession?.timeSlot}
    />
  );
}

