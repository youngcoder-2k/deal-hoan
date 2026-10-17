-- Activate only AFTER a successful manual POST to sync-xtra returns published.
-- Vault secrets required: dealhoan_project_url and dealhoan_xtra_cron_secret.
-- XTRA_CRON_SECRET in Edge Functions must match the Vault value. Never embed credentials here.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create schema if not exists dealhoan_private;
revoke all on schema dealhoan_private from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name='dealhoan_project_url' and decrypted_secret ~ '^https://[a-z0-9]+\.supabase\.co$')
    or not exists (select 1 from vault.decrypted_secrets where name='dealhoan_xtra_cron_secret' and length(decrypted_secret)>=32)
    then raise exception 'Configure Xtra Vault secrets first'; end if;
end $$;
create or replace function dealhoan_private.invoke_xtra() returns bigint
language plpgsql security invoker set search_path = pg_catalog as $$
declare endpoint text; token text;
begin
  select decrypted_secret into strict endpoint from vault.decrypted_secrets where name='dealhoan_project_url';
  select decrypted_secret into strict token from vault.decrypted_secrets where name='dealhoan_xtra_cron_secret';
  return net.http_post(url:=endpoint||'/functions/v1/sync-xtra',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),
    body:='{}'::jsonb,timeout_milliseconds:=120000);
end $$;
revoke all on function dealhoan_private.invoke_xtra() from public, anon, authenticated;
do $$ declare j record; begin
  for j in select jobid from cron.job where jobname in ('dealhoan-sync-deals','dealhoan-sync-xtra') loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
-- UTC 02,05,08,11,14,17 = VN 09,12,15,18,21,00. Leave order jobs untouched.
select cron.schedule('dealhoan-sync-xtra','0 2,5,8,11,14,17 * * *',
  $job$select dealhoan_private.invoke_xtra();$job$);
commit;
