const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const loadTs = require('./helpers/load-ts.cjs');

test('ShopeeFood universal URL preserves canonical paths and removes tracking junk', () => {
  const load = loadTs({});
  const { toShopeeFoodUniversalUrl, buildShopeeFoodAffiliateUrl } = load('lib/deals/affiliate.ts');

  // 1. Presale deals detail URL maps to shopee.vn/universal-link/now-food/... (not blank shopeefood.vn/now-food/...)
  const rawDeal = 'https://shopeefood.vn/now-food/presale-deals-detail/3304425207541760?brandId=8934&merchantId=0&restaurantId=1170300&shareChannel=copy_link&stm_medium=referral&uls_trackid=57252ls500jv';
  const cleanDeal = toShopeeFoodUniversalUrl(rawDeal);
  assert.ok(cleanDeal.startsWith('https://shopee.vn/universal-link/now-food/presale-deals-detail/3304425207541760'), 'Must map /now-food/presale-deals-detail to shopee.vn universal link');
  assert.ok(cleanDeal.includes('restaurantId=1170300'), 'Must preserve restaurantId');
  assert.ok(cleanDeal.includes('brandId=8934'), 'Must preserve brandId');
  assert.ok(!cleanDeal.includes('shareChannel'), 'Must strip shareChannel tracking junk');
  assert.ok(!cleanDeal.includes('uls_trackid'), 'Must strip uls_trackid tracking junk');

  // 2. Shopee universal-link to ShopeeFood shop stays on shopee.vn/universal-link/now-food/shop/:id
  const shopeeShop = 'https://shopee.vn/universal-link/now-food/shop/1170300';
  const cleanShop = toShopeeFoodUniversalUrl(shopeeShop);
  assert.equal(cleanShop, 'https://shopee.vn/universal-link/now-food/shop/1170300', 'Must keep shopee.vn universal-link for /now-food/shop/:id');

  // 3. City restaurant path stays on shopeefood.vn (web route)
  const cityPath = 'https://shopeefood.vn/ho-chi-minh/tra-sua-mixue-nguyen-trai?fbclid=xyz';
  const cleanCity = toShopeeFoodUniversalUrl(cityPath);
  assert.equal(cleanCity, 'https://shopeefood.vn/ho-chi-minh/tra-sua-mixue-nguyen-trai', 'Must preserve city restaurant path');

  // 4. Affiliate URL wraps shopee.vn universal-link via official s.shopee.vn/an_redir with sub_id + affiliate_id
  const affiliateUrl = buildShopeeFoodAffiliateUrl(rawDeal, { subId: '12345', affiliateId: '17333200656' });
  const parsedAff = new URL(affiliateUrl);
  assert.equal(parsedAff.origin + parsedAff.pathname, 'https://s.shopee.vn/an_redir');
  assert.equal(parsedAff.searchParams.get('sub_id'), 'dh12345');
  assert.equal(parsedAff.searchParams.get('affiliate_id'), '17333200656');
  const originLink = parsedAff.searchParams.get('origin_link') || '';
  assert.ok(originLink.startsWith('https://shopee.vn/universal-link/now-food/presale-deals-detail/3304425207541760'));
  assert.ok(originLink.includes('restaurantId=1170300'));

  // Re-wrapping an already-wrapped an_redir URL must not double-wrap
  const rewrapped = buildShopeeFoodAffiliateUrl(affiliateUrl, { subId: '99999', affiliateId: '17333200656' });
  const parsedRewrapped = new URL(rewrapped);
  assert.equal(parsedRewrapped.searchParams.get('sub_id'), 'dh99999');
  assert.equal(parsedRewrapped.searchParams.get('origin_link'), originLink);
});

test('CashbackReceipt renders ShopeeFood as dynamic 6% order-level cashback without flat 4.000đ', () => {
  const react = require('react');
  const reactStub = { ...react, useState: (init) => [typeof init === 'function' ? init() : init, () => {}] };
  const iconStub = (props) => ({ type: 'icon', props });
  const cssProxy = new Proxy({}, { get: (_, prop) => (prop === 'default' || prop === '__esModule') ? cssProxy : String(prop) });
  const load = loadTs({
    react: reactStub,
    'next/image': (props) => ({ type: 'img', props }),
    '@/public/brand/shopeefood-logo.png': '/brand/shopeefood-logo.png',
    '@phosphor-icons/react/dist/csr/ArrowRight': { ArrowRightIcon: iconStub },
    '@phosphor-icons/react/dist/csr/ArrowClockwise': { ArrowClockwiseIcon: iconStub },
    '@phosphor-icons/react/dist/csr/ArrowArcRight': { ArrowArcRightIcon: iconStub },
    '@phosphor-icons/react/dist/csr/Check': { CheckIcon: iconStub },
    '@phosphor-icons/react/dist/csr/Copy': { CopyIcon: iconStub },
    '@phosphor-icons/react/dist/csr/CurrencyCircleDollar': { CurrencyCircleDollarIcon: iconStub },
    '@phosphor-icons/react/dist/csr/Sparkle': { SparkleIcon: iconStub },
    '@phosphor-icons/react/dist/csr/ShoppingCart': { ShoppingCartIcon: iconStub },
    '@phosphor-icons/react/dist/csr/Link': { LinkIcon: iconStub },
    '@phosphor-icons/react/dist/csr/Percent': { PercentIcon: iconStub },
    '@phosphor-icons/react/dist/csr/Ticket': { TicketIcon: iconStub },
    '@phosphor-icons/react/dist/csr/CaretRight': { CaretRightIcon: iconStub },
    '@phosphor-icons/react/dist/csr/X': { XIcon: iconStub },
    [path.resolve(__dirname, '../app/components/coupon-sheet.module.css')]: cssProxy,
    [path.resolve(__dirname, '../app/home-redesign.module.css')]: cssProxy,
    '@/lib/deals/format': {
      formatPrice: (num) => `${(num || 0).toLocaleString('vi-VN')}đ`,
    },
  });

  const { CashbackReceipt } = load('app/components/cashback-hero.tsx');
  const foodProduct = {
    name: 'Quán ngon ShopeeFood',
    price: 0,
    cashback: 0,
    cashbackRate: 6.0,
    platform: 'ShopeeFood',
    trackedLink: 'https://shopeefood.vn/now-food/shop/1170300?sub_id=dh123',
  };

  const vnode = CashbackReceipt({
    product: foodProduct,
    trackedLink: foodProduct.trackedLink,
    copied: false,
    onCopy: () => {},
    onBuy: () => {},
    onClear: () => {},
    isLoggedIn: true,
  });

  // Verify button says "Đặt món ngay"
  const buyBtn = vnode.props.children.find(
    (c) => c && c.props && (c.props.className?.includes('buyButton') || (Array.isArray(c.props.children) && c.props.children.some((x) => typeof x === 'string' && x.includes('Đặt món ngay'))))
  );
  assert.ok(buyBtn, 'ShopeeFood buy button must exist');
  assert.ok(buyBtn.props.children.includes('Đặt món ngay'), 'Button text must be "Đặt món ngay"');
  assert.equal(buyBtn.props.href, foodProduct.trackedLink, 'Must point to canonical ShopeeFood restaurant tracked link');

  // Verify receipt string does not contain flat fake 4.000 or 65.000
  const jsonStr = JSON.stringify(vnode);
  assert.ok(!jsonStr.includes('4.000'), 'ShopeeFood card must not contain hardcoded 4.000đ');
  assert.ok(!jsonStr.includes('65.000'), 'ShopeeFood card must not contain hardcoded 65.000đ');
  assert.ok(jsonStr.includes('Hoàn 6%'), 'ShopeeFood card must clearly display Hoàn 6%');
  assert.ok(jsonStr.includes('Đơn đặt món ShopeeFood'), 'ShopeeFood card must describe price as restaurant order');
});

test('ShopeeFood shortlinks (vn.shp.ee, s.shopee.vn, spf.shopee.vn, shopeefood.vn/u/) resolve safely without error_page or 404 mangling', async () => {
  const load = loadTs({});
  const {
    extractUrlFromText,
    isShopeeFoodUrl,
    resolveShopeeShortlink,
    toShopeeFoodUniversalUrl,
    buildShopeeFoodAffiliateUrl,
  } = load('lib/deals/affiliate.ts');

  // 1. Bare ShopeeFood URL inside Vietnamese share text
  assert.equal(
    extractUrlFromText('Đặt món ngon cùng mình: shopeefood.vn/u/abc123!'),
    'https://shopeefood.vn/u/abc123'
  );
  assert.equal(
    extractUrlFromText('Quán này ngon nè spf.shopee.vn/7fXyZ123'),
    'https://spf.shopee.vn/7fXyZ123'
  );

  // 2. vn.shp.ee redirecting to ShopeeFood universal-link stops before login/verify gate
  const hops = [];
  const mockFetcher = async (url) => {
    hops.push(url);
    if (url === 'https://vn.shp.ee/food123') {
      return new Response('', {
        status: 302,
        headers: { location: 'https://shopee.vn/universal-link/now-food/shop/1170300?utm_source=share' },
      });
    }
    if (url === 'https://spf.shopee.vn/broken123') {
      return new Response('', {
        status: 307,
        headers: { location: 'https://shope.ee/error_page' },
      });
    }
    if (url === 'https://s.shopee.vn/ulsfood') {
      return new Response(
        '<html><script>var deepLinkUrl="shopeevn://home?url=https%3A%2F%2Fshopeefood.vn%2Fnow-food%2Fshop%2F998877";</script></html>',
        { status: 200, headers: { 'content-type': 'text/html' } }
      );
    }
    return new Response('', { status: 404 });
  };

  const resolvedFood = await resolveShopeeShortlink('https://vn.shp.ee/food123', { fetcher: mockFetcher });
  assert.equal(resolvedFood, 'https://shopee.vn/universal-link/now-food/shop/1170300?utm_source=share');
  assert.equal(isShopeeFoodUrl(resolvedFood), true);

  // 3. spf.shopee.vn redirecting to error_page keeps original spf.shopee.vn host (never shopeefood.vn/error_page or shopeefood.vn/broken123)
  const resolvedBroken = await resolveShopeeShortlink('https://spf.shopee.vn/broken123', { fetcher: mockFetcher });
  assert.equal(resolvedBroken, 'https://spf.shopee.vn/broken123');
  const universalSpf = toShopeeFoodUniversalUrl(resolvedBroken);
  assert.equal(universalSpf, 'https://spf.shopee.vn/broken123');
  assert.equal(toShopeeFoodUniversalUrl('https://shopeefood.vn/error_page'), 'https://shopee.vn/universal-link/now-food');

  // 4. s.shopee.vn returning ULS HTML bridge page extracts embedded shopeefood.vn destination
  const resolvedUls = await resolveShopeeShortlink('https://s.shopee.vn/ulsfood', { fetcher: mockFetcher });
  assert.equal(resolvedUls, 'https://shopeefood.vn/now-food/shop/998877');
  assert.equal(isShopeeFoodUrl(resolvedUls), true);

  // 5. buildShopeeFoodAffiliateUrl wraps /now-food/shop/998877 through s.shopee.vn/an_redir with default affiliate_id
  const aff = buildShopeeFoodAffiliateUrl(resolvedUls, { subId: '1f162a51-8baa-404e-b16a-ca4e2d2c4b8d' });
  assert.ok(aff.startsWith('https://s.shopee.vn/an_redir?'));
  assert.ok(aff.includes('affiliate_id=17333200656'));
  assert.ok(aff.includes('sub_id=dh1f162a518baa404eb16aca4e2d2c4b8d'));
  assert.equal(isShopeeFoodUrl(aff), true);
});
