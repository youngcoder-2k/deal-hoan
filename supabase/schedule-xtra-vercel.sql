-- Run only AFTER /api/cron/sync-deals publishes a real batch on Vercel.
-- Reuses the existing Vault job secret; does not touch order jobs or weaken RLS.
begin;
do $$ begin
  if not exists(select 1 from public.xtra_feed where id='current' and checked_at > now()-interval '15 minutes' and expires_at > now()
    and jsonb_array_length(deals)>=18) then
    raise exception 'Verify a successful Vercel Xtra import before scheduling';
  end if;
  if not exists(select 1 from vault.decrypted_secrets where name='dealhoan_cron_secret' and length(trim(decrypted_secret))>=32) then
    raise exception 'Missing existing cron secret';
  end if;
end $$;
create or replace function dealhoan_private.invoke_sync(endpoint text)
returns bigint language plpgsql security invoker set search_path=pg_catalog as $$
declare token text;
begin
  if endpoint not in ('sync-deals','sync-orders') or endpoint is null then raise exception 'Unsupported sync endpoint'; end if;
  select decrypted_secret into strict token from vault.decrypted_secrets where name='dealhoan_cron_secret';
  if length(trim(token))<32 then raise exception 'Invalid cron secret'; end if;
  return net.http_post(url:='https://deal-hoan.vercel.app/api/cron/'||endpoint,
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||trim(token)),
    body:='{}'::jsonb,timeout_milliseconds:=case when endpoint='sync-deals' then 150000 else 60000 end);
end $$;
revoke all on function dealhoan_private.invoke_sync(text) from public,anon,authenticated;
do $$ declare j record; begin
  for j in select jobid from cron.job where jobname in ('dealhoan-sync-deals','dealhoan-sync-xtra') loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
-- VN 00,09,12,15,18,21; UTC+7. Cron owns schedule, Vercel owns Chromium.
select cron.schedule('dealhoan-sync-deals','0 2,5,8,11,14,17 * * *',
  $job$select dealhoan_private.invoke_sync('sync-deals');$job$);
commit;
