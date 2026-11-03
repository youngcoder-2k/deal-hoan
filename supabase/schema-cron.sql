-- DealHoàn: Cấu hình tự động đồng bộ đơn hàng (Cron Job) trên Supabase Database
-- Chạy migration này tại: Supabase Dashboard -> SQL Editor -> New query -> Run

begin;

-- 1. Kích hoạt tiện ích mở rộng pg_cron và pg_net
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Tạo schema riêng tư lưu cấu hình cron nội bộ
create schema if not exists dealhoan_private;
revoke all on schema dealhoan_private from public, anon, authenticated;

-- Bảng lưu secret dự phòng khi môi trường chưa cấu hình Supabase Vault
create table if not exists dealhoan_private.cron_config (
  id text primary key default 'current',
  secret text not null,
  updated_at timestamptz not null default now()
);

-- Khởi tạo secret mặc định nếu chưa có
insert into dealhoan_private.cron_config(id, secret)
values('current', 'dealhoan_cron_secret_auto_sync_32chars_key')
on conflict(id) do nothing;

-- 3. Hàm kích hoạt API đồng bộ sang máy chủ DealHoàn Vercel
create or replace function dealhoan_private.invoke_sync(endpoint text)
returns bigint language plpgsql security invoker
set search_path = pg_catalog
as $$
declare
  token text := null;
begin
  if endpoint not in ('sync-deals', 'sync-orders') or endpoint is null then
    raise exception 'Unsupported sync endpoint';
  end if;

  -- Thử lấy secret bảo mật từ Supabase Vault nếu đã cấu hình
  begin
    select decrypted_secret into token from vault.decrypted_secrets
    where name = 'dealhoan_cron_secret' and length(trim(decrypted_secret)) >= 8
    limit 1;
  exception when others then
    token := null;
  end;

  -- Dự phòng lấy từ bảng dealhoan_private.cron_config
  if token is null or length(trim(token)) = 0 then
    select secret into token from dealhoan_private.cron_config where id = 'current' limit 1;
  end if;

  if token is null or length(trim(token)) = 0 then
    token := 'dealhoan_cron_secret_auto_sync_32chars_key';
  end if;

  -- Thực hiện HTTP POST sang Vercel handler
  return net.http_post(
    url := 'https://deal-hoan.vercel.app/api/cron/' || endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(token)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function dealhoan_private.invoke_sync(text) from public, anon, authenticated;

-- 4. Hủy các cron job cũ nếu đã tồn tại để tránh xung đột
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname in (
    'sync-shopee-orders-every-15-mins',
    'dealhoan-sync-deals',
    'dealhoan-sync-orders'
  ) loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

-- 5. Lập lịch tự động chạy ngầm:
-- • dealhoan-sync-orders: Mỗi 15 phút chạy 1 lần để kéo đơn Shopee mới nhất
-- • dealhoan-sync-deals: Mỗi 4 tiếng chạy 1 lần để quét deals Flash Sale
select cron.schedule(
  'dealhoan-sync-orders',
  '*/15 * * * *',
  $job$select dealhoan_private.invoke_sync('sync-orders');$job$
);

select cron.schedule(
  'dealhoan-sync-deals',
  '0 */4 * * *',
  $job$select dealhoan_private.invoke_sync('sync-deals');$job$
);

commit;
