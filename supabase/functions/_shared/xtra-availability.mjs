/** HTTP 200 and an Affiliate offer do NOT prove a product is purchasable. */
export function classifyProductSignals({ url, text = "", buyEnabled = false }) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== "shopee.vn" || !/^\/product\/[1-9]\d*\/[1-9]\d*$/.test(u.pathname)) return "unknown";
  } catch { return "unknown"; }
  if (/Sản phẩm này không tồn tại|Sản phẩm không tồn tại|Sản phẩm đã bị x[oó]a|This product does not exist/i.test(text)) return "missing";
  return buyEnabled ? "available" : "unknown";
}

export async function inspectShopeeProduct(page, url) {
  try {
    // Only canonical product URLs. Never follow a supplied external verification target.
    if (classifyProductSignals({ url, buyEnabled: true }) !== "available") return { status: "unknown", checkedAt: Date.now() };
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 8000 });
    await page.waitForFunction(() => {
      const main = document.querySelector("main");
      const text = main?.innerText ?? "";
      return /Sản phẩm này không tồn tại|Sản phẩm không tồn tại|Sản phẩm đã bị x[oó]a|This product does not exist/i.test(text)
        || [...(main?.querySelectorAll('button, [role="button"]') ?? [])].some(el => /^(mua ngay|thêm vào giỏ hàng)$/i.test(el.textContent?.trim() ?? "") && !el.disabled && el.getAttribute("aria-disabled") !== "true" && el.getClientRects().length > 0);
    }, null, { timeout: 8000 });
    const signals = await page.evaluate(() => {
      const main = document.querySelector("main");
      return { url: location.origin + location.pathname, text: main?.innerText ?? "",
        buyEnabled: [...(main?.querySelectorAll('button, [role="button"]') ?? [])].some(el => /^(mua ngay|thêm vào giỏ hàng)$/i.test(el.textContent?.trim() ?? "") && !el.disabled && el.getAttribute("aria-disabled") !== "true" && el.getClientRects().length > 0) };
    });
    // A redirect to another product is not verification of the requested product.
    const same = new URL(signals.url).pathname === new URL(url).pathname;
    return { status: same ? classifyProductSignals(signals) : "unknown", checkedAt: Date.now() };
  } catch { return { status: "unknown", checkedAt: Date.now() }; }
}
