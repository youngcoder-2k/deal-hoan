-- DealHoàn Critical Security Patches
-- Chạy script này trong Supabase SQL Editor: Dashboard -> SQL Editor -> New query

begin;

-- ============================================================================
-- 1. Vá lỗ hổng leo quyền Admin qua raw_user_meta_data
-- Chỉ cho phép Email Whitelist hoặc Service-Role gán raw_app_meta_data->>'role' = 'admin'
-- ============================================================================
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
          'trungquan2000bg@gmail.com'
        )
        or (raw_app_meta_data->>'role') = 'admin'
      )
  );
$$;

-- ============================================================================
-- 2. Ngăn chặn người dùng tự sửa số dư ví qua RLS UPDATE
-- Chỉ cấp quyền cập nhật các trường tài khoản ngân hàng, khóa chặt số dư
-- ============================================================================
revoke update on public.user_wallets from authenticated;
grant update (bank_name, bank_account_no, bank_account_name, updated_at)
  on public.user_wallets to authenticated;

-- ============================================================================
-- 3. Hàm tạo lệnh rút tiền nguyên tử (Atomic Withdrawal)
-- Khóa hàng ví (FOR UPDATE) để triệt tiêu hoàn toàn lỗi Race Condition (Double Spending)
-- ============================================================================
create or replace function public.create_withdrawal_request(
  p_user_id uuid,
  p_amount bigint,
  p_bank_name text,
  p_bank_account_no text,
  p_bank_account_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_wallet public.user_wallets%rowtype;
  v_new_req public.withdrawal_requests%rowtype;
  v_req_id uuid := gen_random_uuid();
begin
  -- Validate đầu vào
  if p_user_id is null or p_amount is null or p_amount < 10000 or p_amount > 50000000 or (p_amount % 1000 <> 0) then
    raise exception 'invalid_withdrawal_amount';
  end if;

  if p_bank_name is null or p_bank_account_no is null or p_bank_account_name is null then
    raise exception 'missing_bank_info';
  end if;

  -- 1. Khóa hàng ví của user để xử lý tuần tự (loại trừ race condition)
  select * into v_wallet
  from public.user_wallets
  where user_id = p_user_id
  for update;

  if v_wallet.user_id is null then
    raise exception 'wallet_not_found';
  end if;

  if v_wallet.balance < p_amount then
    raise exception 'insufficient_balance';
  end if;

  -- 2. Tạo bản ghi lệnh rút tiền
  insert into public.withdrawal_requests (
    id,
    user_id,
    amount,
    bank_name,
    bank_account_no,
    bank_account_name,
    status,
    note,
    created_at,
    updated_at
  ) values (
    v_req_id,
    p_user_id,
    p_amount,
    p_bank_name,
    p_bank_account_no,
    upper(p_bank_account_name),
    'pending',
    'Đang chờ đối soát & chuyển khoản qua Napas247',
    now(),
    now()
  )
  returning * into v_new_req;

  -- 3. Trừ số dư ví nguyên tử trong cùng 1 transaction
  update public.user_wallets
  set
    balance = balance - p_amount,
    total_withdrawn = total_withdrawn + p_amount,
    updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'request', row_to_json(v_new_req),
    'new_balance', v_wallet.balance - p_amount
  );
end;
$$;

-- Cấp quyền gọi hàm cho client đã đăng nhập
grant execute on function public.create_withdrawal_request to authenticated, service_role;

-- ============================================================================
-- 4. Hàm xử lý duyệt / từ chối lệnh rút tiền (Atomic Admin Decision)
-- Ngăn chặn hoàn tiền lặp lại (Replay refund) nếu admin từ chối nhiều lần
-- ============================================================================
create or replace function public.process_withdrawal_decision(
  p_withdrawal_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_req public.withdrawal_requests%rowtype;
  v_note text;
begin
  if p_withdrawal_id is null or p_status not in ('completed', 'rejected') then
    raise exception 'invalid_decision_parameters';
  end if;

  -- Khóa hàng lệnh rút
  select * into v_req
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;

  if v_req.id is null then
    raise exception 'withdrawal_not_found';
  end if;

  -- Nếu trạng thái đã là completed hoặc rejected thì không xử lý lại
  if v_req.status <> 'pending' then
    raise exception 'withdrawal_already_processed';
  end if;

  v_note := coalesce(p_note, case when p_status = 'completed' then 'Đã chuyển khoản Napas247 thành công' else 'Thông tin tài khoản ngân hàng chưa chính xác' end);

  -- Cập nhật trạng thái lệnh rút
  update public.withdrawal_requests
  set
    status = p_status,
    note = v_note,
    updated_at = now()
  where id = p_withdrawal_id;

  -- Nếu từ chối, hoàn tiền nguyên tử vào ví người dùng (chỉ hoàn 1 lần duy nhất)
  if p_status = 'rejected' and v_req.amount > 0 then
    update public.user_wallets
    set
      balance = balance + v_req.amount,
      total_withdrawn = greatest(0, total_withdrawn - v_req.amount),
      updated_at = now()
    where user_id = v_req.user_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'status', p_status,
    'note', v_note
  );
end;
$$;

grant execute on function public.process_withdrawal_decision to service_role;

commit;
