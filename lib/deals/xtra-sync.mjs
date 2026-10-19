import { collectXtra } from '../../supabase/functions/_shared/xtra-collect.mjs';
import { xtraExpiresAt } from '../../supabase/functions/_shared/xtra-slots.mjs';

/** Only Shopee cookies are imported. Never forward an entire personal browser profile. */
export function parseShopeeState(raw, now = Date.now()) {
  if (typeof raw !== 'string' || raw.length > 60000) throw Error('invalid_session');
  const state = JSON.parse(raw);
  if (!Array.isArray(state?.cookies) || !state.cookies.length || state.cookies.length > 150) throw Error('invalid_session');
  if (state.cookies.some(c => !c || typeof c.name !== 'string' || !c.name || typeof c.value !== 'string'
    || !/^\.?([a-z0-9-]+\.)*shopee\.vn$/i.test(c.domain) || !c.path?.startsWith('/')
    || !Number.isFinite(c.expires) || (c.expires !== -1 && c.expires * 1000 <= now))) throw Error('invalid_session');
  return { cookies: state.cookies, origins: [] };
}

/** Dependencies injected for failure-path tests; production uses service-role RPCs. */
export async function syncXtra({ env, createDb, launchBrowser, collect = collectXtra, onPublished = () => {}, now = Date.now }) {
  const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SHOPEE_STORAGE_STATE'].filter(k => !env[k]?.trim());
  if (missing.length) return { code: 503, body: { status: 'configuration_missing', missing } };
  let state;
  try { state = parseShopeeState(env.SHOPEE_STORAGE_STATE, now()); }
  catch { return { code: 503, body: { status: 'shopee_session_invalid' } }; }
  const marginPercent = env.XTRA_MARGIN_PERCENT?.trim() ? Number(env.XTRA_MARGIN_PERCENT) : 12;
  if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent > 100) return { code: 503, body: { status: 'margin_invalid' } };
  const db = createDb(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  let lease, browser, context;
  let phase = 'database_not_ready';
  let published = false;
  try {
    const lock = await db.rpc('claim_xtra_import');
    if (lock.error) return { code: 503, body: { status: phase } };
    lease = lock.data;
    if (!lease) return { code: 409, body: { status: 'already_running' } };
    phase = 'browser_launch_failed';
    browser = await launchBrowser();
    context = await browser.newContext({ storageState: state, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
    phase = 'login_required_or_source_unavailable';
    const products = await collect(context, { marginPercent, deadline: now() + 100000, now });
    // Fail closed: partial, stale, unavailable, low-rate, duplicate or external products never publish.
    const unique = new Set();
    const valid = products.filter(p => {
      if (!p || unique.has(p.productUrl) || !/^https:\/\/shopee\.vn\/product\/[1-9]\d*\/[1-9]\d*$/.test(p.productUrl)
        || p.affiliateOffer?.source !== 'shopee-xtra' || p.availability?.status !== 'available'
        || ![p.price,p.cashback,p.affiliateOffer.checkedAt,p.availability.checkedAt,p.affiliateOffer.commissionRate].every(Number.isFinite)
        || p.price <= 0 || p.price > 1500000 || p.cashback / p.price < .1 || p.cashback > p.price || p.cashback > 500000
        || p.affiliateOffer.commissionRate < .1 || p.affiliateOffer.commissionRate > 1
        || p.affiliateOffer.checkedAt > now() || p.availability.checkedAt > now()
        || xtraExpiresAt(p.affiliateOffer.checkedAt) <= now() || xtraExpiresAt(p.availability.checkedAt) <= now()) return false;
      unique.add(p.productUrl); return true;
    }).slice(0, 18);
    if (valid.length < 18) return { code: 502, body: { status: 'insufficient_purchasable_products', verified: valid.length, required: 18 } };
    phase = 'publish_failed';
    const checked = Math.min(...valid.map(p => p.affiliateOffer.checkedAt));
    const result = await db.rpc('publish_xtra_import', { token: lease, products: valid,
      checked: new Date(checked).toISOString(), expiry: new Date(xtraExpiresAt(checked)).toISOString() });
    if (result.error) return { code: 502, body: { status: phase } };
    published = true;
    phase = 'published_cache_refresh_failed';
    await onPublished();
    return { code: 200, body: { status: 'published', count: valid.length, checkedAt: new Date(checked).toISOString() } };
  } catch {
    // Do not echo browser exceptions, request headers, cookies, URLs or credentials.
    return { code: 502, body: { status: phase, ...(published ? { published: true } : {}) } };
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (lease) await Promise.resolve(db.rpc('release_xtra_import', { token: lease })).catch(() => {});
  }
}
