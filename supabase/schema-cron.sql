-- Apply as postgres in Supabase SQL Editor AFTER configuring CRON_SECRET in Vercel.
-- In Supabase Vault create dealhoan_cron_secret with the SAME value.
-- No credentials are embedded in this migration or cron.job.command.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Stop before modifying jobs if setup is incomplete.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets
    where name = 'dealhoan_cron_secret' and length(trim(decrypted_secret)) >= 32) then
    raise exception 'Create Vault secret dealhoan_cron_secret (32+ chars), matching Vercel CRON_SECRET, before applying.';
  end if;
end $$;

create schema if not exists dealhoan_private;
revoke all on schema dealhoan_private from public, anon, authenticated;

-- Invoker privileges only: cron executes as the postgres migration owner.
create or replace function dealhoan_private.invoke_sync(endpoint text)
returns bigint language plpgsql security invoker
set search_path = pg_catalog
as $$
declare
  token text;
begin
  if endpoint not in ('sync-deals', 'sync-orders') or endpoint is null then
    raise exception 'Unsupported sync endpoint';
  end if;
  select decrypted_secret into strict token from vault.decrypted_secrets
    where name = 'dealhoan_cron_secret';
  if length(trim(token)) < 32 then raise exception 'Invalid cron secret'; end if;
  return net.http_post(
    url := 'https://deal-hoan.vercel.app/api/cron/' || endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(token)),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function dealhoan_private.invoke_sync(text) from public, anon, authenticated;

-- Only remove this application's old/new named jobs; never swallow setup errors.
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname in (
    'sync-shopee-orders-every-15-mins',
    'dealhoan-sync-deals', 'dealhoan-sync-orders'
  ) loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

-- UTC: deals every 4 hours; orders every 15 minutes (existing Supabase cadence).
select cron.schedule('dealhoan-sync-deals', '0 */4 * * *',
  $job$select dealhoan_private.invoke_sync('sync-deals');$job$);
select cron.schedule('dealhoan-sync-orders', '*/15 * * * *',
  $job$select dealhoan_private.invoke_sync('sync-orders');$job$);
commit;
