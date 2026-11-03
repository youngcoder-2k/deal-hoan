-- Migration: Lưu trữ phiên mua sắm tracking của người dùng trên máy chủ Supabase
-- Đảm bảo dữ liệu đơn hàng và trạng thái hoàn tiền được quản lý tập trung trên Server Database,
-- không bị mất khi khách hàng đổi trình duyệt (Messenger -> Safari) hay xoá bộ nhớ tạm.

create table if not exists public.shopping_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id text not null default 'ĐANG-CHỜ-SÀN',
  platform text not null default 'Shopee',
  product_name text not null default 'Sản phẩm mua qua DealHoàn',
  product_image text,
  order_value bigint not null default 0 check (order_value >= 0),
  cashback_amount bigint not null default 0 check (cashback_amount >= 0),
  sub_id text,
  status text not null default 'tracking' check (status in ('tracking', 'pending', 'completed', 'rejected')),
  note text default 'Đã chuyển sang sàn mua hàng · Đang chờ sàn đối soát và gửi đơn (15–45 phút).',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chỉ mục hỗ trợ truy vấn nhanh theo user và thời gian
create index if not exists idx_shopping_sessions_user_id on public.shopping_sessions(user_id, created_at desc);
create index if not exists idx_shopping_sessions_sub_id on public.shopping_sessions(sub_id);

-- Bật Row Level Security (RLS) bảo vệ dữ liệu người dùng
alter table public.shopping_sessions enable row level security;
revoke all on public.shopping_sessions from anon;
grant select, insert, update on public.shopping_sessions to authenticated;
grant all on public.shopping_sessions to service_role;

-- Chính sách: Người dùng chỉ được xem và ghi phiên mua của chính tài khoản mình
drop policy if exists "Users can view own shopping sessions" on public.shopping_sessions;
create policy "Users can view own shopping sessions"
  on public.shopping_sessions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own shopping sessions" on public.shopping_sessions;
create policy "Users can insert own shopping sessions"
  on public.shopping_sessions for insert to authenticated
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
