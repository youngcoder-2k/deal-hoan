-- DealHoàn Cashback Orders Schema for Supabase
-- Run this in Supabase SQL Editor: Dashboard -> SQL Editor -> New query

-- 1. Bảng lưu trữ đơn hàng hoàn tiền của từng người dùng
create table if not exists public.cashback_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id text not null,                           -- Mã đơn hàng từ sàn (e.g. 240915123456789)
  platform text not null default 'Shopee',          -- 'Shopee' | 'TikTok Shop' | 'Lazada'
  product_name text,                                -- Tên sản phẩm chính trong đơn
  product_image text,                               -- Link ảnh sản phẩm (nếu có)
  order_value bigint not null default 0,            -- Tổng giá trị đơn hàng (VNĐ)
  commission_amount bigint not null default 0,      -- Tổng hoa hồng sàn chi trả (VNĐ)
  cashback_amount bigint not null default 0,        -- Tiền hoàn thực tế cho user (VNĐ)
  cashback_rate numeric(5, 2) default 100.00,       -- Tỷ lệ hoàn tiền (%)
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected')),
  sub_id text,                                      -- Tham số tracking subId đã dùng khi click
  note text,                                        -- Ghi chú từ sàn hoặc lý do từ chối
  ordered_at timestamptz not null default now(),    -- Thời điểm khách đặt hàng
  confirmed_at timestamptz,                         -- Thời điểm đơn được duyệt hoàn thành
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_order_platform unique (order_id, platform)
);

-- 2. Chỉ mục tối ưu truy vấn
create index if not exists idx_cashback_orders_user_id on public.cashback_orders(user_id, created_at desc);
create index if not exists idx_cashback_orders_status on public.cashback_orders(status);
create index if not exists idx_cashback_orders_sub_id on public.cashback_orders(sub_id);
create index if not exists idx_cashback_orders_order_id on public.cashback_orders(order_id);

-- 3. Bật Row Level Security (RLS)
alter table public.cashback_orders enable row level security;

-- Policies cho cashback_orders:
-- Người dùng chỉ có thể xem đơn hàng của chính mình
create policy "Users can view own orders"
  on public.cashback_orders for select
  using (auth.uid() = user_id);

-- Người dùng có thể gửi báo soát đơn (insert)
create policy "Users can submit own order claim"
  on public.cashback_orders for insert
  with check (auth.uid() = user_id);

-- Admin có thể xem và cập nhật tất cả đơn hàng
create policy "Admins can view all orders"
  on public.cashback_orders for select
  using (public.is_admin());

create policy "Admins can update all orders"
  on public.cashback_orders for update
  using (public.is_admin());

create policy "Admins can insert orders"
  on public.cashback_orders for insert
  with check (public.is_admin());
