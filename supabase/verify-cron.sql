-- Job dispatch success does NOT imply HTTP/application success.
select jobname, schedule, active from cron.job
where jobname in ('dealhoan-sync-deals', 'dealhoan-sync-orders');
select j.jobname, r.status, r.return_message, r.start_time
from cron.job_run_details r join cron.job j using (jobid)
where j.jobname in ('dealhoan-sync-deals', 'dealhoan-sync-orders')
order by r.start_time desc limit 20;
-- Match id to the request ID returned by invoke_sync / job run return_message.
-- HTTP 200 may contain success:false (missing cookie or disabled auto-sync).
select id, status_code, timed_out, error_msg, content, created
from net._http_response order by created desc limit 20;
