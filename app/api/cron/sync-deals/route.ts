import { isAuthorizedCron } from '@/lib/cron/auth';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { syncXtra } from '@/lib/deals/xtra-sync.mjs';
import { getVouchers } from '@/lib/deals/vouchers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Under the database's 180-second lease; leaves time for cleanup after collection.
export const maxDuration = 150;
// Load Chromium only after authentication/config checks, never at module startup.
async function launchXtraBrowser() {
  const browser = await import('@/lib/deals/xtra-browser');
  return browser.launchXtraBrowser();
}
export async function GET(request: NextRequest) { return handleSyncDeals(request); }
export async function POST(request: NextRequest) { return handleSyncDeals(request); }

/** The existing Supabase Cron endpoint now IMPORTS data instead of only clearing cache. */
async function handleSyncDeals(request: NextRequest) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized cron execution' }, { status: 401 });
  const probe = request.nextUrl.searchParams.get('probe');
  if (probe) {
    if (probe !== 'chromium') return NextResponse.json({ status: 'invalid_probe' }, { status: 400 });
    let browser;
    try {
      browser = await launchXtraBrowser();
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.setContent('<title>DealHoan Chromium check</title>');
      const ok = await page.title() === 'DealHoan Chromium check';
      return NextResponse.json({ status: ok ? 'chromium_ready' : 'chromium_probe_failed', engine: 'vercel-chromium', version: browser.version() }, { status: ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return NextResponse.json({ status: 'browser_launch_failed', engine: 'vercel-chromium' }, { status: 502 });
    } finally { await browser?.close().catch(() => {}); }
  }

  // Tự động đồng bộ kho voucher Shopee thật
  await getVouchers().catch(() => null);

  const result = await syncXtra({
    env: process.env,
    createDb: (url: string, key: string) => createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(10000) }) },
    }),
    launchBrowser: launchXtraBrowser,
    onPublished: () => {
      revalidatePath('/');
      revalidateTag('deals', { expire: 0 });
    },
  });
  return NextResponse.json({ ...result.body, engine: 'vercel-chromium' }, {
    status: result.code, headers: { 'Cache-Control': 'no-store' },
  });
}
