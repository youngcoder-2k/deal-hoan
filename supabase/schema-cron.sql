-- ==============================================================================
-- DealHoàn - Thiết lập Cron Job tự động trên Supabase (pg_cron + pg_net)
-- Chạy đoạn SQL này trong: Supabase Dashboard -> SQL Editor -> New Query
-- ==============================================================================

-- 1. Bật extension pg_cron (lập lịch) và pg_net (gọi HTTP request)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Hủy job cũ (nếu đã từng tạo) để tránh chạy trùng lặp
do $$
begin
  perform cron.unschedule('sync-shopee-orders-every-15-mins');
exception when others then
  null;
end $$;

-- 3. Tạo Cron Job chạy tự động mỗi 15 phút
-- Thay đổi 'https://dealhoan.vn' bằng domain thực tế của bạn khi triển khai
select cron.schedule(
  'sync-shopee-orders-every-15-mins',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := 'https://dealhoan.vn/api/cron/sync-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent', 'Supabase-Cron-Worker'
    )
  );
  $$
);

-- ==============================================================================
-- CÁC CÂU LỆNH KIỂM TRA HỮU ÍCH TRÊN SUPABASE:
--
-- 1. Xem danh sách các cron job đang chạy:
--    select * from cron.job;
--
-- 2. Xem lịch sử các lần chạy gần nhất:
--    select * from cron.job_run_details order by start_time desc limit 10;
--
-- 3. Tắt cron job:
--    select cron.unschedule('sync-shopee-orders-every-15-mins');
-- ==============================================================================
