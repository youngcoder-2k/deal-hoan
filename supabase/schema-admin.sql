-- DealHoàn Admin RLS Policies & Views for Supabase
-- Run this in Supabase SQL Editor if you want to enforce Admin RLS policies directly

-- 1. Helper Function: Kiểm tra người dùng hiện tại có phải là Admin hay không
-- Dựa trên email hoặc metadata trong auth.jwt()
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from auth.users
    where id = auth.uid()
      and (
        email in (
          'quangvh.technical@gmail.com',
          'admin@dealhoan.vn',
          'contact@dealhoan.vn'
        )
        or (raw_user_meta_data->>'role') = 'admin'
        or (raw_app_meta_data->>'role') = 'admin'
      )
  );
$$;

-- 2. Cấp quyền Admin cho bảng user_wallets
create policy "Admins can view all wallets"
  on public.user_wallets for select
  using (public.is_admin());

create policy "Admins can update all wallets"
  on public.user_wallets for update
  using (public.is_admin());

-- 3. Cấp quyền Admin cho bảng withdrawal_requests
create policy "Admins can view all withdrawals"
  on public.withdrawal_requests for select
  using (public.is_admin());

create policy "Admins can update all withdrawals"
  on public.withdrawal_requests for update
  using (public.is_admin());

-- 4. View tổng hợp thông tin User + Wallet + Lệnh rút tiền (Tiện lợi cho Admin truy vấn SQL)
create or replace view public.admin_user_overview as
select
  u.id as user_id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) as full_name,
  u.created_at as user_created_at,
  u.last_sign_in_at,
  coalesce(w.balance, 0) as balance,
  coalesce(w.pending_balance, 0) as pending_balance,
  coalesce(w.total_withdrawn, 0) as total_withdrawn,
  coalesce(w.bank_name, u.raw_user_meta_data->>'bank_name', '') as bank_name,
  coalesce(w.bank_account_no, u.raw_user_meta_data->>'bank_account_no', '') as bank_account_no,
  coalesce(w.bank_account_name, u.raw_user_meta_data->>'bank_account_name', '') as bank_account_name,
  (case
    when coalesce(w.bank_account_no, u.raw_user_meta_data->>'bank_account_no', '') <> '' then true
    else false
  end) as is_bank_configured,
  count(wr.id) as total_withdrawal_requests,
  count(case when wr.status = 'pending' then 1 end) as pending_withdrawal_requests
from auth.users u
left join public.user_wallets w on w.user_id = u.id
left join public.withdrawal_requests wr on wr.user_id = u.id
group by u.id, u.email, u.raw_user_meta_data, u.created_at, u.last_sign_in_at, w.balance, w.pending_balance, w.total_withdrawn, w.bank_name, w.bank_account_no, w.bank_account_name;
