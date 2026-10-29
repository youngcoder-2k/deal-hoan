const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const loadTs = require('./helpers/load-ts.cjs');

test('CashbackReceipt unauthenticated behavior vs authenticated behavior', () => {
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
  const dummyProduct = {
    name: 'Váy Nhật Bản',
    price: 373837,
    cashback: 20563,
    cashbackRate: 36.5,
    platform: 'Shopee',
    trackedLink: 'https://s.shopee.vn/an_redir?origin_link=abc',
  };

  // 1. Unauthenticated state
  let authAction = null;
  let copyCalled = false;
  let buyCalled = false;

  const unauthVNode = CashbackReceipt({
    product: dummyProduct,
    trackedLink: dummyProduct.trackedLink,
    copied: false,
    onCopy: () => { copyCalled = true; },
    onBuy: () => { buyCalled = true; },
    onClear: () => {},
    isLoggedIn: false,
    onRequireAuth: (action) => { authAction = action; },
  });

  // Find buy button
  const buyBtn = unauthVNode.props.children.find(
    (c) => c && c.props && (c.props.className?.includes('buyButton') || (Array.isArray(c.props.children) && c.props.children.some((x) => typeof x === 'string' && x.includes('MUA NGAY'))))
  );
  assert.ok(buyBtn, 'Buy button element must exist');
  assert.equal(buyBtn.type, 'button', 'Unauthenticated buy button must be a button, not an anchor link');
  assert.equal(buyBtn.props.href, undefined, 'Unauthenticated buy button must not have an href pointing to marketplace');
  assert.ok(
    buyBtn.props.children.includes('Đăng nhập để MUA NGAY'),
    'Unauthenticated buy button text must be "Đăng nhập để MUA NGAY"'
  );

  // Trigger click on unauthenticated buy button
  buyBtn.props.onClick();
  assert.equal(authAction, 'buy', 'Clicking unauthenticated buy button must trigger onRequireAuth("buy")');

  // Find link section
  const linkSection = unauthVNode.props.children.find(
    (c) => c && c.props && c.props.className && c.props.className.includes('linkSection')
  );
  assert.ok(linkSection, 'Link section must exist');
  const linkRow = linkSection.props.children.find(
    (c) => c && c.props && c.props.className && c.props.className.includes('linkRow')
  );
  assert.ok(linkRow, 'Link row must exist');

  const [linkEl, copyBtn] = linkRow.props.children;
  assert.equal(linkEl.type, 'button', 'Unauthenticated link element must be a button, not a direct redirect anchor');
  assert.equal(linkEl.props.href, undefined, 'Unauthenticated link must not have href redirecting to Shopee');

  // Trigger click on unauthenticated link
  linkEl.props.onClick();
  assert.equal(authAction, 'link', 'Clicking unauthenticated link must trigger onRequireAuth("link")');

  // Trigger click on unauthenticated copy button
  authAction = null;
  copyBtn.props.onClick();
  assert.equal(authAction, 'copy', 'Clicking unauthenticated copy button must trigger onRequireAuth("copy")');
  assert.equal(copyCalled, false, 'onCopy must NOT be called when unauthenticated');

  // 2. Authenticated state
  let authCopyCalled = false;
  let authBuyCalled = false;
  const authVNode = CashbackReceipt({
    product: dummyProduct,
    trackedLink: dummyProduct.trackedLink,
    copied: false,
    onCopy: () => { authCopyCalled = true; },
    onBuy: () => { authBuyCalled = true; },
    onClear: () => {},
    isLoggedIn: true,
  });

  const authBuyBtn = authVNode.props.children.find(
    (c) => c && c.props && (c.props.className?.includes('buyButton') || (Array.isArray(c.props.children) && c.props.children.some((x) => typeof x === 'string' && x.includes('Mua ngay'))))
  );
  assert.ok(authBuyBtn, 'Authenticated buy button must exist');
  assert.equal(authBuyBtn.type, 'a', 'Authenticated buy button must be an anchor link');
  assert.equal(authBuyBtn.props.href, dummyProduct.trackedLink);
  assert.ok(
    authBuyBtn.props.children.includes('Mua ngay'),
    'Authenticated buy button text must be "Mua ngay"'
  );

  const authLinkSection = authVNode.props.children.find(
    (c) => c && c.props && c.props.className && c.props.className.includes('linkSection')
  );
  const authLinkRow = authLinkSection.props.children.find(
    (c) => c && c.props && c.props.className && c.props.className.includes('linkRow')
  );
  const [authLinkEl, authCopyBtn] = authLinkRow.props.children;
  assert.equal(authLinkEl.type, 'a', 'Authenticated link must be an anchor');
  assert.equal(authLinkEl.props.href, dummyProduct.trackedLink);

  authCopyBtn.props.onClick();
  assert.equal(authCopyCalled, true, 'onCopy must be called when authenticated');
});

test('home-client.tsx passes isLoggedIn and onRequireAuth, guards copy and link redirect', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../app/home-client.tsx'), 'utf8');
  assert.ok(code.includes('isLoggedIn={Boolean(user)}'), 'CashbackReceipt must receive isLoggedIn prop');
  assert.ok(code.includes('onRequireAuth={handleRequireAuth}'), 'CashbackReceipt must receive onRequireAuth prop');
  assert.ok(code.includes('Vui lòng đăng nhập để nhận hoàn tiền'));
});
