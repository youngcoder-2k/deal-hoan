-- Stop Xtra imports only, retain data, Vault and order scheduler.
begin;
update cron.job set active=false where jobname in ('dealhoan-sync-deals','dealhoan-sync-xtra');
commit;
-- Roll back the application commit separately to restore the old cache-only handler.
