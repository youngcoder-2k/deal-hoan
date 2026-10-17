-- Stop scheduling, preserve imported data and credentials for recovery.
do $$ declare j record; begin
  for j in select jobid from cron.job where jobname='dealhoan-sync-xtra' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
