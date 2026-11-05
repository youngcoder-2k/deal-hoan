const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const loadTs = require('./helpers/load-ts.cjs');

test('ShopeeFood universal URL preserves canonical paths and removes tracking junk', () => {
  const load = loadTs({});
  const { toShopeeFoodUniversalUrl, buildShopeeFoodAffiliateUrl } = load('lib/deals/affiliate.ts');

  // 1. Presale deals detail URL
  const rawDeal = 'https://shopeefood.vn/now-food/presale-deals-detail/3304425207541760?brandId=8934&merchantId=0&restaurantId=1170300&shareChannel=copy_link&stm_medium=referral&uls_trackid=57252ls500jv';
  const cleanDeal = toShopeeFoodUniversalUrl(rawDeal);
  assert.ok(cleanDeal.includes('/now-food/presale-deals-detail/3304425207541760'), 'Must preserve /now-food/presale-deals-detail path');
  assert.ok(cleanDeal.includes('restaurantId=1170300'), 'Must preserve restaurantId');
  assert.ok(cleanDeal.includes('brandId=8934'), 'Must preserve brandId');
  assert.ok(!cleanDeal.includes('shareChannel'), 'Must strip shareChannel tracking junk');
  assert.ok(!cleanDeal.includes('uls_trackid'), 'Must strip uls_trackid tracking junk');

  // 2. Shopee universal-link to ShopeeFood shop
  const shopeeShop = 'https://shopee.vn/universal-link/now-food/shop/1170300';
  const cleanShop = toShopeeFoodUniversalUrl(shopeeShop);
  assert.equal(cleanShop, 'https://shopeefood.vn/now-food/shop/1170300', 'Must map universal-link to shopeefood.vn/now-food/shop/:id');

  // 3. City restaurant path
  const cityPath = 'https://shopeefood.vn/ho-chi-minh/tra-sua-mixue-nguyen-trai?fbclid=xyz';
  const cleanCity = toShopeeFoodUniversalUrl(cityPath);
  assert.equal(cleanCity, 'https://shopeefood.vn/ho-chi-minh/tra-sua-mixue-nguyen-trai', 'Must preserve city restaurant path');

  // 4. Affiliate URL tracking parameter attachment
  const affiliateUrl = buildShopeeFoodAffiliateUrl(rawDeal, { subId: '12345', affiliateId: '17333200656' });
  assert.ok(affiliateUrl.includes('/now-food/presale-deals-detail/3304425207541760'));
  assert.ok(affiliateUrl.includes('restaurantId=1170300'));
  assert.ok(affiliateUrl.includes('sub_id=dh12345'));
  assert.ok(affiliateUrl.includes('affiliate_id=17333200656'));
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
