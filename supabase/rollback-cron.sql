-- Disable both schedulers only. Do not restore the old unauthenticated job.
-- Keep Vault secret/function for diagnosis; no production request is sent.
begin;
update cron.job set active = false
where jobname in ('dealhoan-sync-deals', 'dealhoan-sync-orders');
commit;
