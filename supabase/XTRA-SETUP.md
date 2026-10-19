# Shopee Xtra: Vercel Chromium + Supabase (no VPS / Browserless)

The active implementation is `/api/cron/sync-deals`, a **Node.js** Vercel Function
(maxDuration 150s). It runs Playwright Core with the pinned `@sparticuz/chromium`
package inside the function. The compressed browser files are explicitly traced
into that route. No cloud-browser subscription or remote browser endpoint needed.
The legacy Supabase `sync-xtra` Edge Function is not used by this schedule.

## Configure once

1. Keep `schema-xtra.sql` applied in Supabase. RLS remains private/service-role-only.
2. Vercel Production variables (server-only except URL):
   - `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: existing project values.
   - `CRON_SECRET`: existing scheduler secret, matching Vault `dealhoan_cron_secret`.
   - `SHOPEE_STORAGE_STATE`: Playwright JSON with valid Shopee-only cookies.
     This is an authenticated Affiliate session, not an Open API token. Import
     only with the account holder's consent. Never put cookies in chat/Git/logs.
     Origins/localStorage are discarded. Expired cookies fail validation.
   - `XTRA_MARGIN_PERCENT`: optional; defaults to 12, matching current payout policy.
3. Redeploy after environment changes. Keep Node 22+ (Chromium package requirement).
4. Manually call the authenticated endpoint; require `status: published`, count 18,
   plus a genuinely new `xtra_feed.checked_at`. An HTTP 401/503, scheduler success,
   successful build, or Chromium launch alone does NOT establish a working import.
5. Only then apply `schedule-xtra-vercel.sql`. It refuses to activate without a
   recent 18-product batch. VN times: 00,09,12,15,18,21. Check `net._http_response`
   as well as `cron.job_run_details` — pg_net request enqueue is not import success.
6. Website cache is revalidated immediately after a successful publish. Failure
   preserves the previous feed and original timestamps; expired feeds stay hidden.

## Operator test

Use Supabase SQL Editor (no secret readout):

```sql
select dealhoan_private.invoke_sync('sync-deals');
-- In a subsequent query, inspect the returned request ID:
select status_code, content from net._http_response where id=REQUEST_ID;
select checked_at, expires_at, jsonb_array_length(deals) from public.xtra_feed;
```

The endpoint now performs an import, unlike the previous cache-only implementation.
`configuration_missing` lists missing variable NAMES only. Other bounded statuses:
`shopee_session_invalid`, `already_running`, `browser_launch_failed`,
`login_required_or_source_unavailable`, `insufficient_purchasable_products`,
`publish_failed`, `published_cache_refresh_failed`. No browser exception dumps.

## Quality and limits

Samples up to 20 shops on the first Affiliate Xtra listing, ranked by displayed
commission. It does not guarantee global top offers. Same-shop products allowed.
Only product-level Xtra commission, actual price, >=10% buyer cashback and a live
storefront purchase button qualify. Explicit missing pages are excluded; login,
CAPTCHA, errors and redirects remain unverified. Minimum 18 verified unique products
before an atomic publish; imports never pad a short batch with fabricated/stale items.
100s collector budget + 20s browser startup fit below 150s function / 180s DB lease.
Shopee can reject datacenter browsers or expire sessions; human re-login may still
be required. No automatic CAPTCHA solving or authentication bypass is installed.

For local development use Playwright's installed Chromium (no VERCEL=1) and local
secret variables. Production never depends on a continuously running local machine.
`rollback-xtra-vercel.sql` disables only product imports; retains data/order jobs.

References:
- https://vercel.com/kb/guide/deploying-puppeteer-with-nextjs-on-vercel
- https://github.com/Sparticuz/chromium#usage-with-playwright
- https://supabase.com/docs/guides/functions/schedule-functions
