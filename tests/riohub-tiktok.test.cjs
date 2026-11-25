const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const ROOT = path.resolve(__dirname, "..");

function loadTsModule(relPath, mocks = {}) {
  const absPath = path.join(ROOT, relPath);
  const cache = new Map();

  function compileAndRun(filePath) {
    if (cache.has(filePath)) return cache.get(filePath).exports;
    const source = fs.readFileSync(filePath, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: filePath,
    });
    const mod = { exports: {} };
    cache.set(filePath, mod);
    const localRequire = (spec) => {
      if (Object.prototype.hasOwnProperty.call(mocks, spec)) return mocks[spec];
      if (spec.startsWith("@/")) {
        const target = path.join(ROOT, spec.slice(2) + ".ts");
        if (fs.existsSync(target)) return compileAndRun(target);
      }
      if (spec.startsWith(".")) {
        const base = path.resolve(path.dirname(filePath), spec);
        if (fs.existsSync(base + ".ts")) return compileAndRun(base + ".ts");
      }
      return Module.createRequire(filePath)(spec);
    };
    const fn = new Function("exports", "require", "module", "__filename", "__dirname", outputText);
    fn(mod.exports, localRequire, mod, filePath, path.dirname(filePath));
    return mod.exports;
  }

  return compileAndRun(absPath);
}

const affiliate = loadTsModule("lib/deals/affiliate.ts");
const riohub = loadTsModule("lib/deals/riohub-affiliate.ts", {
  "@/lib/deals/cashback": {
    recordCashbackOrder: async () => ({ success: true }),
  },
});

test("TikTok Shop URL detection, extraction from share text, and productId parsing", () => {
  assert.equal(affiliate.isTikTokUrl("https://vt.tiktok.com/ZSs66vgaD/"), true);
  assert.equal(affiliate.isTikTokUrl("https://www.tiktok.com/t/ZSs66vgaD/"), true);
  assert.equal(affiliate.isTikTokUrl("https://shop.tiktok.com/view/product/1736270422342206747?region=VN"), true);
  assert.equal(affiliate.isTikTokUrl("https://shopee.vn/product/1/2"), false);
  assert.equal(affiliate.isTikTokUrl("https://evil-tiktok.com.attacker.net/x"), false);

  assert.equal(
    affiliate.extractUrlFromText("Xem sản phẩm cực hot trên TikTok Shop: vt.tiktok.com/ZSs66vgaD/"),
    "https://vt.tiktok.com/ZSs66vgaD/"
  );
  assert.equal(
    affiliate.extractTikTokProductId("https://shop.tiktok.com/view/product/1736270422342206747?region=VN"),
    "1736270422342206747"
  );
});

test("RioHub HMAC-SHA256 webhook signature verification", () => {
  const payload = JSON.stringify({ order_id: "5789123", status: "COMPLETED" });
  const secret = "test_rio_secret";
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  assert.equal(riohub.verifyRioHubWebhookSignature(payload, sig, secret), true);
  assert.equal(riohub.verifyRioHubWebhookSignature(payload, `sha256=${sig}`, secret), true);
  assert.equal(riohub.verifyRioHubWebhookSignature(payload, "deadbeef", secret), false);
  assert.equal(riohub.verifyRioHubWebhookSignature(payload + " ", sig, secret), false);
});

test("resolveRioHubTikTokProduct calls /links + /products, supports failover mirror, and parses basis-point rate", async () => {
  const calls = [];
  let firstAttempt = true;
  const mockFetcher = async (url, init) => {
    calls.push({ url, method: init.method, apiKey: init.headers["X-Riohub-Api-Key"] });
    // Simulate primary mirror 502 on first call to test backup mirror failover
    if (firstAttempt && url.startsWith("https://riohub.vn/")) {
      firstAttempt = false;
      return new Response("Bad Gateway", { status: 502 });
    }
    if (url.includes("/partner/tiktok/affiliate/links")) {
      const body = JSON.parse(init.body);
      assert.equal(body.creator_username, "quannt1410");
      assert.equal(body.sub_id, "dh1f162a518baa404eb16aca4e2d2c4b8d");
      return new Response(
        JSON.stringify({
          affiliate_link: "https://www.tiktok.com/t/ZSs66vgaD/",
          sub_id: body.sub_id,
          product_id: "1736270422342206747",
          creator_username: "quannt1410",
        }),
        { status: 200 }
      );
    }
    if (url.includes("/partner/tiktok/affiliate/products")) {
      return new Response(
        JSON.stringify({
          products: [
            {
              id: "1736270422342206747",
              title: "Cơ Bida Way Cues LD Series",
              main_image_url: "https://p16-oec-sg.ibyteimg.com/test.jpg",
              shop: { name: "Như Ý Billiards Shops" },
              original_price: { currency: "VND", minimum_amount: "6500000", maximum_amount: "6500000" },
              sales_price: { currency: "VND", minimum_amount: "4999999", maximum_amount: "4999999" },
              commission: { amount: "299999.94 - 299999.94", currency: "VND", rate: 600 },
              has_inventory: true,
            },
          ],
        }),
        { status: 200 }
      );
    }
    throw new Error("Unexpected URL: " + url);
  };

  const config = {
    apiKey: "rhk_test_key",
    creatorUsername: "quannt1410",
    apiBases: ["https://riohub.vn/api/v1", "https://riohub.riokupon.com/api/v1"],
  };

  const res = await riohub.resolveRioHubTikTokProduct("https://vt.tiktok.com/ZSs66vgaD/", {
    subId: "1f162a51-8baa-404e-b16a-ca4e2d2c4b8d",
    config,
    fetcher: mockFetcher,
  });

  assert.equal(res.ok, true);
  assert.equal(res.product.productId, "1736270422342206747");
  assert.equal(res.product.price, 4999999);
  assert.equal(res.product.originalPrice, 6500000);
  assert.equal(res.product.commissionRatePercent, 6);
  assert.equal(res.product.grossCommission, 300000);
  assert.equal(res.product.affiliateUrl, "https://www.tiktok.com/t/ZSs66vgaD/");
  assert.equal(res.product.seller, "Như Ý Billiards Shops");
  assert.equal(calls.length, 3); // 1st failed on primary, 2nd succeeded on mirror, 3rd fetched product
});

test("syncRioHubOrders maps statuses, multi-item order IDs, and records TikTok Shop orders atomically", async () => {
  const recorded = [];
  const mockFetcher = async () =>
    new Response(
      JSON.stringify({
        creator_username: "quannt1410",
        page: 1,
        page_size: 50,
        total: 4,
        orders: [
          {
            order_id: "5771001",
            line_item_id: "ITEM1",
            product_name: "Son kem lì",
            payment_amount: 250000,
            actual_commission: 27500,
            sub_id: "dh1f162a518baa404eb16aca4e2d2c4b8d",
            status: "SETTLED",
            order_create_time: 1763900000,
          },
          {
            order_id: "5771001",
            line_item_id: "ITEM2",
            product_name: "Phấn phủ",
            payment_amount: 180000,
            estimated_commission: 18000,
            sub_id: "dh1f162a518baa404eb16aca4e2d2c4b8d",
            status: "CANCELLED",
          },
          {
            order_id: "5771002",
            product_name: "Áo khoác gió",
            gmv: 350000,
            estimated_commission: 35000,
            tags: ["dh1f162a518baa404eb16aca4e2d2c4b8d"],
            status: "AWAITING_SHIPMENT",
          },
          {
            order_id: "5771003",
            product_name: "Anonymous click",
            gmv: 100000,
            estimated_commission: 5000,
            sub_id: "dealhoan",
            status: "PENDING",
          },
        ],
      }),
      { status: 200 }
    );

  const config = {
    apiKey: "rhk_test_key",
    creatorUsername: "quannt1410",
    apiBases: ["https://riohub.vn/api/v1"],
  };

  const res = await riohub.syncRioHubOrders({
    config,
    fetcher: mockFetcher,
    record: async (params) => {
      recorded.push(params);
      return { success: true };
    },
  });

  assert.equal(res.code, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.scanned, 4);
  assert.equal(res.body.processed, 3);
  assert.equal(res.body.unmatched, 1);
  assert.equal(res.body.failed, 0);

  assert.equal(recorded[0].orderId, "5771001-ITEM1");
  assert.equal(recorded[0].platform, "TikTok Shop");
  assert.equal(recorded[0].status, "completed");
  assert.equal(recorded[0].commissionAmount, 27500);

  assert.equal(recorded[1].orderId, "5771001-ITEM2");
  assert.equal(recorded[1].status, "rejected");

  assert.equal(recorded[2].orderId, "5771002");
  assert.equal(recorded[2].status, "pending");
  assert.equal(recorded[2].subId, "dh1f162a518baa404eb16aca4e2d2c4b8d");
});
