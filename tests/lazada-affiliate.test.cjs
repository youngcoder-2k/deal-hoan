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
const lazada = loadTsModule("lib/deals/lazada-affiliate.ts", {
  "@/lib/deals/cashback": {
    recordCashbackOrder: async () => ({ success: true }),
  },
});

test("Lazada URL detection, cleaning, and productId extraction", () => {
  assert.equal(affiliate.isLazadaUrl("https://www.lazada.vn/products/pdp-i13415412621-s117139082455.html"), true);
  assert.equal(affiliate.isLazadaUrl("https://s.lazada.vn/s.ZaWtbJ?t=p-iEdthev-s23rTeRb"), true);
  assert.equal(affiliate.isLazadaUrl("https://c.lazada.vn/t/c.ZCM0dX"), true);
  assert.equal(affiliate.isLazadaUrl("https://lzd.co/abc123"), true);
  assert.equal(affiliate.isLazadaUrl("https://shopee.vn/product/1/2"), false);
  assert.equal(affiliate.isLazadaUrl("https://evil-lazada.vn.attacker.com/x"), false);

  assert.equal(
    affiliate.extractLazadaProductId("https://www.lazada.vn/products/pdp-i13415412621-s117139082455.html"),
    "13415412621"
  );
  assert.equal(
    affiliate.extractLazadaProductId("lazada://vn/pdp?itemId=13415412621&skuId=117139082455"),
    "13415412621"
  );

  // Shortlink preserves ?t=... while stripping previous sub_aff_id
  const cleanedShort = affiliate.cleanLazadaUrl(
    "Mua ngay https://s.lazada.vn/s.ZaWtbJ?t=p-iEdthev-s23rTeRb&sub_aff_id=old_user"
  );
  assert.equal(cleanedShort, "https://s.lazada.vn/s.ZaWtbJ?t=p-iEdthev-s23rTeRb");

  // Full PDP URL strips UTM/spm/exlaz noise
  const cleanedFull = affiliate.cleanLazadaUrl(
    "https://www.lazada.vn/products/pdp-i13415412621-s117139082455.html?spm=a2o4n.123&exlaz=xyz&sub_aff_id=old"
  );
  assert.equal(
    cleanedFull,
    "https://www.lazada.vn/products/pdp-i13415412621-s117139082455.html"
  );
});

test("Lazada HMAC-SHA256 request signature matches canonical sorted spec", () => {
  const params = {
    userToken: "tok123",
    app_key: "105827",
    timestamp: "1700000000000",
    sign_method: "sha256",
    inputType: "url",
    inputValue: "https://www.lazada.vn/products/pdp-i13415412621.html",
  };
  const expectedRaw =
    "/marketing/getlink" +
    "app_key105827" +
    "inputTypeurl" +
    "inputValuehttps://www.lazada.vn/products/pdp-i13415412621.html" +
    "sign_methodsha256" +
    "timestamp1700000000000" +
    "userTokentok123";
  const expectedSig = crypto
    .createHmac("sha256", "mysecret")
    .update(expectedRaw)
    .digest("hex")
    .toUpperCase();

  assert.equal(lazada.signLazadaRequest("/marketing/getlink", params, "mysecret"), expectedSig);
});

test("resolveLazadaProduct combines /marketing/getlink and /marketing/product/feed directly", async () => {
  const calls = [];
  const mockFetcher = async (url) => {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, params: Object.fromEntries(parsed.searchParams) });
    if (parsed.pathname.endsWith("/marketing/getlink")) {
      return new Response(
        JSON.stringify({
          code: "0",
          result: {
            success: true,
            data: {
              urlBatchGetLinkInfoList: [
                {
                  productId: "13415412621",
                  productName: "AULA Win60HE MAX",
                  regularCommission: "6%",
                  regularPromotionLink:
                    "https://s.lazada.vn/s.ZaWt3D?t=p-iEdthev-s23rTeRb&sub_aff_id=dh1f162a518baa404eb16aca4e2d2c4b8d",
                },
              ],
            },
          },
        }),
        { status: 200 }
      );
    }
    if (parsed.pathname.endsWith("/marketing/product/feed")) {
      return new Response(
        JSON.stringify({
          code: "0",
          result: {
            success: true,
            data: [
              {
                productId: 13415412621,
                productName: "AULA | Win60HE MAX Magnetic Mechanical Gaming Numpad",
                sellerName: "Brand Super Deal",
                discountPrice: 588000,
                pictures: ["https://filebroker-cdn.lazada.vn/kf/test.jpg"],
                totalCommissionRate: 0.06,
                totalCommissionAmount: 35280,
                bonusOfferFlag: true,
              },
            ],
          },
        }),
        { status: 200 }
      );
    }
    throw new Error("Unexpected URL " + url);
  };

  const config = {
    appKey: "105827",
    appSecret: "testsecret",
    userToken: "testtoken",
    apiBase: "https://api.lazada.vn/rest",
  };

  const res = await lazada.resolveLazadaProduct(
    "https://www.lazada.vn/products/pdp-i13415412621-s117139082455.html",
    {
      subId: "1f162a51-8baa-404e-b16a-ca4e2d2c4b8d",
      config,
      fetcher: mockFetcher,
      now: 1700000000000,
    }
  );

  assert.equal(res.ok, true);
  assert.equal(res.product.productId, "13415412621");
  assert.equal(res.product.price, 588000);
  assert.equal(res.product.grossCommission, 35280);
  assert.equal(res.product.commissionRatePercent, 6);
  assert.equal(res.product.isVerifiedPrice, true);
  assert.equal(res.product.seller, "Brand Super Deal");
  assert.equal(res.product.imageUrl, "https://filebroker-cdn.lazada.vn/kf/test.jpg");
  assert.match(res.product.affiliateUrl, /sub_aff_id=dh1f162a518baa404eb16aca4e2d2c4b8d/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].params.subAffId, "dh1f162a518baa404eb16aca4e2d2c4b8d");
  assert.equal(calls[0].params.subId1, "dh1f162a518baa404eb16aca4e2d2c4b8d");
});

test("syncLazadaOrders maps conversion report statuses, multi-SKU order IDs, and records atomically", async () => {
  const recorded = [];
  const mockFetcher = async () =>
    new Response(
      JSON.stringify({
        code: "0",
        result: {
          success: true,
          data: [
            {
              orderId: "9001001",
              orderLineId: "L1",
              skuName: "Bàn phím cơ AULA",
              orderAmt: 588000,
              estPayout: 35280,
              subAffId: "dh1f162a518baa404eb16aca4e2d2c4b8d",
              status: "Fulfilled",
              validity: "Valid",
              conversionTime: "2026-11-20 10:15:00",
            },
            {
              orderId: "9001001",
              orderLineId: "L2",
              skuName: "Chuột gaming",
              orderAmt: 200000,
              estPayout: 10000,
              subAffId: "dh1f162a518baa404eb16aca4e2d2c4b8d",
              status: "Cancelled",
              validity: "Invalid",
              conversionTime: "2026-11-20 10:15:00",
            },
            {
              orderId: "9001002",
              skuName: "Túi xách ELACCENT",
              orderAmt: 149000,
              estPayout: 7450,
              subId1: "dh1f162a518baa404eb16aca4e2d2c4b8d",
              status: "Pending",
              validity: "Valid",
            },
            {
              orderId: "9001003",
              skuName: "Unmatched click",
              orderAmt: 100000,
              estPayout: 5000,
              subAffId: "dealhoan",
              status: "Pending",
            },
          ],
        },
      }),
      { status: 200 }
    );

  const config = {
    appKey: "105827",
    appSecret: "testsecret",
    userToken: "testtoken",
    apiBase: "https://api.lazada.vn/rest",
  };

  const result = await lazada.syncLazadaOrders({
    config,
    fetcher: mockFetcher,
    record: async (params) => {
      recorded.push(params);
      return { success: true };
    },
    now: Date.UTC(2026, 10, 23, 2, 0, 0),
  });

  assert.equal(result.code, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.scanned, 4);
  assert.equal(result.body.processed, 3);
  assert.equal(result.body.unmatched, 1);
  assert.equal(result.body.failed, 0);

  assert.equal(recorded[0].orderId, "9001001-L1");
  assert.equal(recorded[0].platform, "Lazada");
  assert.equal(recorded[0].status, "completed");
  assert.equal(recorded[0].commissionAmount, 35280);

  assert.equal(recorded[1].orderId, "9001001-L2");
  assert.equal(recorded[1].status, "rejected");

  assert.equal(recorded[2].orderId, "9001002");
  assert.equal(recorded[2].status, "pending");
});
