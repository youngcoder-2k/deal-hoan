# Shopee Xtra: Supabase + remote Chromium (no VPS)

Status: source prepared; not deployed or tested against a remote browser. A Shopee token alone is not a cloud browser credential. This integration uses an authenticated Shopee browser storage-state cookie jar, NOT an OAuth access token. Do not paste either into chat or Git.

## Required configuration

1. Apply `schema-xtra.sql` as the database owner. RLS denies client access; only the service role reads/writes the feed and takes import leases.
2. Choose a cloud Chromium provider compatible with Playwright CDP. Browserless documents `chromium.connectOverCDP` over WSS. Configure its full WSS URL as `BROWSER_CDP_URL` in Edge Function Secrets; it is separate from Shopee authentication.
3. Set these Edge Function Secrets through Supabase Dashboard:
   - `XTRA_CRON_SECRET`: random 32+ character job secret.
   - `BROWSER_CDP_URL`: authenticated WSS endpoint for the cloud Chromium service.
   - `SHOPEE_STORAGE_STATE`: JSON storageState with only Shopee cookies. An opaque Shopee access token is not accepted by this implementation. Never upload a whole browser profile. Setting this on the remote runner shares the Shopee session with the selected browser provider; approve that destination before supplying it.
   - `XTRA_MARGIN_PERCENT`: buyer payout deduction, e.g. 12 to match the existing booster configuration. Keep this synchronized when payout policy changes.
   - Hosted Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Deploy the function:

```sh
supabase functions deploy sync-xtra --project-ref PROJECT_REF
```

5. Manually POST via Supabase function testing with Authorization Bearer matching XTRA_CRON_SECRET. Verify `published` plus `count > 0` and a new `xtra_feed.checked_at` before activating cron. Cookie expiry / OTP / CAPTCHA require human reauthentication; the function never solves or bypasses those challenges. Errors never replace the existing successful batch or renew its timestamps.
6. Set server-only Vercel `SUPABASE_SERVICE_ROLE_KEY` and existing `NEXT_PUBLIC_SUPABASE_URL`. Deploy the application. Only the server reads the private feed; credentials never reach client props.
7. Store `dealhoan_project_url` and `dealhoan_xtra_cron_secret` in Supabase Vault, then apply `schedule-xtra.sql`. The latter must equal XTRA_CRON_SECRET. Run the job manually once and inspect both the pg_net HTTP response and xtra_feed timestamp; cron SQL success alone is not importer success.

## Behaviour

- Cron triggers at 00:00,09:00,12:00,15:00,18:00,21:00 Asia/Ho_Chi_Minh (UTC expression `0 2,5,8,11,14,17 * * *`).
- Products require a rendered Xtra badge, item/shop ID, real price and per-product commission. Shop-level "up to" rates are never copied to products.
- A 95-second crawl budget covers up to 12 shops on the first sorted Xtra page; this is not an exhaustive catalog/global-top guarantee. Partial nonempty batches can publish; empty/failed crawls preserve the previous batch.
- Only one importer holds a 3-minute lease. An expired lease cannot publish. Failed runs await the next scheduled slot; no automatic retry is installed.
- Data expires at the NEXT slot + 15 minutes. A midnight batch lasts until 09:15, not merely 30 minutes. All feed freshness derives from the original checked_at; it is not extended on failed sync.
- Website server cache may take up to 15 minutes to pick up a new batch. The homepage countdown is not changed by this backend integration.
- `rollback-xtra.sql` stops only the Xtra job, retaining database data. Reapply the pre-existing cron migration if you deliberately want its old job restored.

## References
- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/functions/examples/screenshots
- https://docs.browserless.io/baas/quick-start
