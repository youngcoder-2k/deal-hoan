# Supabase schedules for DealHoàn

Vercel hosts the HTTP handlers; Supabase schedules authenticated POST requests.
No Vercel Cron definition is required (including on Hobby).

## Apply
1. Generate a random secret of at least 32 characters. Add `CRON_SECRET` to the
   production Vercel project environment. Redeploy before enabling jobs.
2. In Supabase Dashboard → Vault, create `dealhoan_cron_secret` with the same
   value. Do not paste the value into Git, screenshots, query strings or logs.
3. Enable Cron (pg_cron), pg_net and Vault in the project if not already enabled.
4. Run `supabase/schema-cron.sql` as postgres in SQL Editor. The transaction fails
   before replacing jobs if the Vault secret is missing. Re-running replaces only
   these named jobs, without duplicates. Schedules use UTC:
   - `dealhoan-sync-deals`: every four hours.
   - `dealhoan-sync-orders`: every 15 minutes (preserves the old Supabase schedule).
5. Run `supabase/verify-cron.sql`. Confirm exactly two active jobs and inspect the
   HTTP response, not only `cron.job_run_details.status`.

## Test invocation
Run `select dealhoan_private.invoke_sync('sync-deals');` in SQL Editor, note the
request ID, then check its response in `net._http_response` after completion.
Order sync can create/update order records; invoke manually only when ready.
401 means the production and Vault secrets differ or production is unconfigured.
HTTP 200 with `success:false` is not a successful sync: check cookie/configuration.
The handlers still have their pre-existing provider/storage behavior; this change
moves scheduling, not scraping or persistent-storage implementation.

## Rollback
Run `supabase/rollback-cron.sql` to pause these two jobs. Do not restore the old
unauthenticated schedule or Vercel's four-hour schedule on Hobby. Keep the secret
until confirming no remaining scheduler uses it. Code rollback is separate.

References: https://supabase.com/docs/guides/cron and
https://supabase.com/docs/guides/functions/schedule-functions
