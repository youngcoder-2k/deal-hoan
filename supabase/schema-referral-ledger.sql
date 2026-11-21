-- DealHoàn Referral Program + Immutable Financial Ledger (Sổ cái) Schema
-- Run this in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- Safe to run multiple times (idempotent).

begin;

-- ============================================================================
-- 1. Mở rộng bảng user_wallets: thêm cột locked_balance (Đang khóa - thưởng giới thiệu)
-- ============================================================================
alter table public.user_wallets
  add column if not exists locked_balance bigint not null default 0;

alter table public.user_wallets
  add column if not exists total_withdrawn bigint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_user_wallets_locked_non_negative'
      and conrelid = 'public.user_wallets'::regclass
  ) then
    alter table public.user_wallets
      add constraint chk_user_wallets_locked_non_negative check (locked_balance >= 0);
  end if;
end $$;

-- Bảo mật nghiêm ngặt: người dùng chỉ được sửa thông tin ngân hàng, tuyệt đối không sửa số dư
revoke update on public.user_wallets from authenticated;
grant update (bank_name, bank_account_no, bank_account_name, updated_at)
  on public.user_wallets to authenticated;

-- ============================================================================
-- 2. Bảng app_settings: lưu cấu hình động của Admin trên DB (bền vững trên Vercel)
-- ============================================================================
create table if not exists public.app_settings (
  id text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from public, anon, authenticated;
grant select, insert, update on public.app_settings to service_role;

insert into public.app_settings (id, settings, updated_by)
values (
  'referral_program',
  jsonb_build_object(
    'enabled', true,
    'referrerReward', 10000,
    'refereeReward', 10000,
    'referrerMinQualifyingCashback', 50000,
    'refereeMinQualifyingCashback', 50000,
    'expiryDays', 90,
    'blockSameDevice', true,
    'blockSameBankAccount', true,
    'flagSameIpHours', 24,
    'maxReferralsPerIp7d', 3,
    'maxAccountAgeDays', 1
  ),
  'system'
)
on conflict (id) do nothing;

insert into public.app_settings (id, settings, updated_by)
values (
  'cashback_booster',
  jsonb_build_object(
    'userCashbackPercent', 88.0,
    'safetyMarginPercent', 12.0,
    'boostFactor', 1.0,
    'maxBonusRate', 1.0,
    'minBonusRate', 0.3,
    'autoScaleWithUsers', false
  ),
  'system'
)
on conflict (id) do nothing;

-- ============================================================================
-- 3. Bảng wallet_ledger: Sổ cái tài chính bất biến (Append-Only Financial Ledger)
-- Ghi nhận 100% biến động tiền của toàn hệ thống để đối soát và kiểm toán
-- ============================================================================
create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  seq bigserial unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in (
    'cashback_pending',
    'cashback_settled',
    'cashback_reverted',
    'cashback_rejected',
    'cashback_adjusted',
    'referral_locked',
    'referral_unlocked',
    'referral_expired',
    'referral_revoked',
    'withdrawal_requested',
    'withdrawal_completed',
    'withdrawal_rejected',
    'admin_adjustment',
    'reconciliation_sync'
  )),
  bucket text not null check (bucket in ('balance','pending_balance','locked_balance','total_withdrawn','multi')),
  delta_balance bigint not null default 0,
  delta_pending bigint not null default 0,
  delta_locked bigint not null default 0,
  delta_withdrawn bigint not null default 0,
  balance_after bigint not null,
  pending_after bigint not null,
  locked_after bigint not null,
  withdrawn_after bigint not null,
  reference_type text,
  reference_id text,
  idempotency_key text unique,
  actor_type text not null default 'system' check (actor_type in ('system','user','admin','cron','webhook')),
  actor_id text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_ledger_user_seq on public.wallet_ledger(user_id, seq desc);
create index if not exists idx_wallet_ledger_created_at on public.wallet_ledger(created_at desc);
create index if not exists idx_wallet_ledger_entry_type on public.wallet_ledger(entry_type, created_at desc);
create index if not exists idx_wallet_ledger_reference on public.wallet_ledger(reference_type, reference_id);

-- Khóa tuyệt đối UPDATE / DELETE trên sổ cái (bắt buộc chỉ ghi thêm / bút toán đảo)
create or replace function public.prevent_wallet_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'wallet_ledger_is_immutable';
end;
$$;

drop trigger if exists trg_wallet_ledger_immutable on public.wallet_ledger;
create trigger trg_wallet_ledger_immutable
  before update or delete on public.wallet_ledger
  for each row execute function public.prevent_wallet_ledger_mutation();

alter table public.wallet_ledger enable row level security;
revoke all on public.wallet_ledger from public, anon, authenticated;
grant select on public.wallet_ledger to authenticated;
grant select, insert on public.wallet_ledger to service_role;
grant usage, select on sequence public.wallet_ledger_seq_seq to service_role;

drop policy if exists "Users can view own wallet ledger" on public.wallet_ledger;
create policy "Users can view own wallet ledger"
  on public.wallet_ledger for select to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================================
-- 4. Bảng user_device_signals: Lưu dấu vân tay thiết bị / trình duyệt / IP chống spam
-- ============================================================================
create table if not exists public.user_device_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  fingerprint_hash text,
  ip_hash text,
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(user_id, device_id)
);

create index if not exists idx_user_device_signals_device on public.user_device_signals(device_id);
create index if not exists idx_user_device_signals_fp on public.user_device_signals(fingerprint_hash);
create index if not exists idx_user_device_signals_ip on public.user_device_signals(ip_hash, last_seen_at desc);
create index if not exists idx_user_device_signals_user on public.user_device_signals(user_id, last_seen_at desc);

alter table public.user_device_signals enable row level security;
revoke all on public.user_device_signals from public, anon, authenticated;
grant all on public.user_device_signals to service_role;

-- ============================================================================
-- 5. Bảng user_referrals: Lưu quan hệ giới thiệu A -> B, trạng thái khóa & mở khóa
-- ============================================================================
create table if not exists public.user_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referee_id uuid not null references auth.users(id) on delete cascade,
  ref_code text not null,
  status text not null default 'locked' check (status in ('locked','review_pending','unlocked','expired','revoked')),
  referrer_reward bigint not null default 10000 check (referrer_reward >= 0),
  referee_reward bigint not null default 10000 check (referee_reward >= 0),
  referrer_min_qualifying bigint not null default 50000 check (referrer_min_qualifying >= 0),
  referee_min_qualifying bigint not null default 50000 check (referee_min_qualifying >= 0),
  fraud_status text not null default 'clean' check (fraud_status in ('clean','flagged','blocked')),
  fraud_reasons jsonb not null default '[]'::jsonb,
  referee_email_normalized text,
  referee_device_id text,
  referee_fingerprint_hash text,
  signup_ip_hash text,
  expires_at timestamptz not null,
  unlocked_at timestamptz,
  expired_at timestamptz,
  revoked_at timestamptz,
  decided_by text,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_user_referrals_referee unique (referee_id),
  constraint chk_user_referrals_not_self check (referrer_id <> referee_id)
);

create index if not exists idx_user_referrals_referrer on public.user_referrals(referrer_id, created_at desc);
create index if not exists idx_user_referrals_status on public.user_referrals(status, expires_at);
create index if not exists idx_user_referrals_device on public.user_referrals(referee_device_id);
create index if not exists idx_user_referrals_fp on public.user_referrals(referee_fingerprint_hash);
create index if not exists idx_user_referrals_email on public.user_referrals(referee_email_normalized);
create index if not exists idx_user_referrals_ip on public.user_referrals(signup_ip_hash, created_at desc);

alter table public.user_referrals enable row level security;
revoke all on public.user_referrals from public, anon, authenticated;
grant select on public.user_referrals to authenticated;
grant all on public.user_referrals to service_role;

drop policy if exists "Users can view own referrals" on public.user_referrals;
create policy "Users can view own referrals"
  on public.user_referrals for select to authenticated
  using ((select auth.uid()) = referrer_id or (select auth.uid()) = referee_id);

-- ============================================================================
-- 6. Hàm nội bộ ghi 1 dòng vào Sổ cái (append_wallet_ledger)
-- ============================================================================
create or replace function public.append_wallet_ledger(
  p_user_id uuid,
  p_entry_type text,
  p_delta_balance bigint default 0,
  p_delta_pending bigint default 0,
  p_delta_locked bigint default 0,
  p_delta_withdrawn bigint default 0,
  p_reference_type text default null,
  p_reference_id text default null,
  p_idempotency_key text default null,
  p_actor_type text default 'system',
  p_actor_id text default null,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_w public.user_wallets%rowtype;
  v_nonzero int := 0;
  v_bucket text := 'balance';
  v_id uuid;
begin
  select * into v_w from public.user_wallets where user_id = p_user_id;
  if v_w.user_id is null then
    raise exception 'wallet_not_found_for_ledger';
  end if;

  if coalesce(p_delta_balance, 0) <> 0 then v_nonzero := v_nonzero + 1; v_bucket := 'balance'; end if;
  if coalesce(p_delta_pending, 0) <> 0 then v_nonzero := v_nonzero + 1; v_bucket := 'pending_balance'; end if;
  if coalesce(p_delta_locked, 0) <> 0 then v_nonzero := v_nonzero + 1; v_bucket := 'locked_balance'; end if;
  if coalesce(p_delta_withdrawn, 0) <> 0 then v_nonzero := v_nonzero + 1; v_bucket := 'total_withdrawn'; end if;
  if v_nonzero > 1 then
    v_bucket := 'multi';
  elsif v_nonzero = 0 then
    if p_entry_type = 'withdrawal_completed' then
      v_bucket := 'total_withdrawn';
    else
      v_bucket := 'balance';
    end if;
  end if;

  insert into public.wallet_ledger (
    user_id, entry_type, bucket,
    delta_balance, delta_pending, delta_locked, delta_withdrawn,
    balance_after, pending_after, locked_after, withdrawn_after,
    reference_type, reference_id, idempotency_key,
    actor_type, actor_id, note, metadata
  ) values (
    p_user_id, p_entry_type, v_bucket,
    coalesce(p_delta_balance, 0), coalesce(p_delta_pending, 0),
    coalesce(p_delta_locked, 0), coalesce(p_delta_withdrawn, 0),
    coalesce(v_w.balance, 0), coalesce(v_w.pending_balance, 0),
    coalesce(v_w.locked_balance, 0), coalesce(v_w.total_withdrawn, 0),
    p_reference_type, p_reference_id, nullif(trim(coalesce(p_idempotency_key, '')), ''),
    coalesce(p_actor_type, 'system'), p_actor_id, p_note, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.append_wallet_ledger(uuid,text,bigint,bigint,bigint,bigint,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.append_wallet_ledger(uuid,text,bigint,bigint,bigint,bigint,text,text,text,text,text,text,jsonb) to service_role;

-- ============================================================================
-- 7. Hàm tính số tiền tích lũy đủ điều kiện mở khóa thưởng giới thiệu của 1 user
-- Công thức: max(tổng đơn completed, (khả dụng + đã rút) - tổng thưởng giới thiệu đã mở khóa)
-- -> Đảm bảo đúng tổng (khả dụng + đã rút) từ mua hàng thật, KHÔNG lấy thưởng mở thưởng.
-- ============================================================================
create or replace function public.compute_user_qualifying_cashback(p_user_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_orders_completed bigint := 0;
  v_wallet_balance bigint := 0;
  v_wallet_withdrawn bigint := 0;
  v_unlocked_bonuses bigint := 0;
  v_wallet_non_bonus bigint := 0;
begin
  select coalesce(sum(cashback_amount), 0)
    into v_orders_completed
  from public.cashback_orders
  where user_id = p_user_id and status = 'completed';

  select coalesce(balance, 0), coalesce(total_withdrawn, 0)
    into v_wallet_balance, v_wallet_withdrawn
  from public.user_wallets
  where user_id = p_user_id;

  select coalesce(sum(
    case
      when referrer_id = p_user_id then referrer_reward
      when referee_id = p_user_id then referee_reward
      else 0
    end
  ), 0)
    into v_unlocked_bonuses
  from public.user_referrals
  where status = 'unlocked'
    and (referrer_id = p_user_id or referee_id = p_user_id);

  v_wallet_non_bonus := greatest(
    0,
    (coalesce(v_wallet_balance, 0) + coalesce(v_wallet_withdrawn, 0)) - coalesce(v_unlocked_bonuses, 0)
  );

  return greatest(coalesce(v_orders_completed, 0), v_wallet_non_bonus);
end;
$$;

revoke all on function public.compute_user_qualifying_cashback(uuid) from public, anon, authenticated;
grant execute on function public.compute_user_qualifying_cashback(uuid) to service_role;

-- ============================================================================
-- 8. Hàm tự động kiểm tra mở khóa & hết hạn thưởng giới thiệu cho 1 user
-- ============================================================================
create or replace function public.evaluate_referral_unlocks_for_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ref public.user_referrals%rowtype;
  v_cfg jsonb := '{}'::jsonb;
  v_block_same_device boolean := true;
  v_block_same_bank boolean := true;
  v_a_qual bigint;
  v_b_qual bigint;
  v_a_bank text;
  v_b_bank text;
  v_reasons jsonb;
  v_fraud_status text;
  v_bank_used_elsewhere boolean;
  v_shared_device boolean;
  v_a_locked_cur bigint;
  v_b_locked_cur bigint;
  v_a_deduct bigint;
  v_b_deduct bigint;
  v_unlocked int := 0;
  v_review int := 0;
  v_expired int := 0;
  v_first_uid uuid;
  v_second_uid uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('unlocked', 0, 'review_pending', 0, 'expired', 0);
  end if;

  select settings into v_cfg from public.app_settings where id = 'referral_program';
  v_block_same_device := coalesce((v_cfg->>'blockSameDevice')::boolean, true);
  v_block_same_bank := coalesce((v_cfg->>'blockSameBankAccount')::boolean, true);

  for v_ref in
    select *
    from public.user_referrals
    where status in ('locked', 'review_pending')
      and (referrer_id = p_user_id or referee_id = p_user_id)
    order by created_at asc
    for update skip locked
  loop
    v_first_uid := least(v_ref.referrer_id, v_ref.referee_id);
    v_second_uid := greatest(v_ref.referrer_id, v_ref.referee_id);

    -- Đảm bảo 2 ví tồn tại
    insert into public.user_wallets(user_id) values(v_first_uid) on conflict(user_id) do nothing;
    insert into public.user_wallets(user_id) values(v_second_uid) on conflict(user_id) do nothing;

    -- Khóa 2 ví theo thứ tự UUID tăng dần, tránh tuyệt đối deadlock (NOWAIT nếu đang bận trong tx đồng thời)
    begin
      perform 1 from public.user_wallets where user_id = v_first_uid for update nowait;
      perform 1 from public.user_wallets where user_id = v_second_uid for update nowait;
    exception when lock_not_available then
      continue;
    end;

    -- Case A: Hết hạn mở khóa (quá hạn áp dụng cho cả locked và review_pending)
    if now() >= v_ref.expires_at then
      select locked_balance into v_a_locked_cur from public.user_wallets where user_id = v_ref.referrer_id;
      select locked_balance into v_b_locked_cur from public.user_wallets where user_id = v_ref.referee_id;
      v_a_deduct := least(coalesce(v_a_locked_cur, 0), v_ref.referrer_reward);
      v_b_deduct := least(coalesce(v_b_locked_cur, 0), v_ref.referee_reward);

      update public.user_referrals
      set status = 'expired', expired_at = now(), updated_at = now()
      where id = v_ref.id;

      if v_a_deduct > 0 then
        update public.user_wallets
        set locked_balance = locked_balance - v_a_deduct, updated_at = now()
        where user_id = v_ref.referrer_id;

        perform public.append_wallet_ledger(
          v_ref.referrer_id, 'referral_expired',
          0, 0, -v_a_deduct, 0,
          'referral', v_ref.id::text, 'ref_exp:' || v_ref.id::text || ':referrer',
          'system', 'referral_engine',
          'Hết hạn mở khóa thưởng giới thiệu (người giới thiệu)',
          jsonb_build_object('role', 'referrer', 'referee_id', v_ref.referee_id, 'expires_at', v_ref.expires_at)
        );
      end if;

      if v_b_deduct > 0 then
        update public.user_wallets
        set locked_balance = locked_balance - v_b_deduct, updated_at = now()
        where user_id = v_ref.referee_id;

        perform public.append_wallet_ledger(
          v_ref.referee_id, 'referral_expired',
          0, 0, -v_b_deduct, 0,
          'referral', v_ref.id::text, 'ref_exp:' || v_ref.id::text || ':referee',
          'system', 'referral_engine',
          'Hết hạn mở khóa thưởng chào mừng giới thiệu (người được mời)',
          jsonb_build_object('role', 'referee', 'referrer_id', v_ref.referrer_id, 'expires_at', v_ref.expires_at)
        );
      end if;

      v_expired := v_expired + 1;
      continue;
    end if;

    -- Đang chờ Admin duyệt tay và chưa hết hạn -> giữ nguyên để Admin quyết định
    if v_ref.status = 'review_pending' then
      continue;
    end if;

    -- Case B: Kiểm tra đồng thời cả A >= mốc A và B >= mốc B
    v_a_qual := public.compute_user_qualifying_cashback(v_ref.referrer_id);
    v_b_qual := public.compute_user_qualifying_cashback(v_ref.referee_id);

    if v_a_qual < v_ref.referrer_min_qualifying or v_b_qual < v_ref.referee_min_qualifying then
      continue;
    end if;

    -- Case C: Kiểm tra lại chống gian lận (trùng STK ngân hàng hiện tại/lịch sử rút + trùng thiết bị sau đăng ký)
    v_reasons := coalesce(v_ref.fraud_reasons, '[]'::jsonb);
    v_fraud_status := coalesce(v_ref.fraud_status, 'clean');

    select regexp_replace(coalesce(bank_account_no, ''), '\D', '', 'g')
      into v_a_bank
    from public.user_wallets where user_id = v_ref.referrer_id;

    select regexp_replace(coalesce(bank_account_no, ''), '\D', '', 'g')
      into v_b_bank
    from public.user_wallets where user_id = v_ref.referee_id;

    if v_block_same_bank then
      -- Kiểm tra trùng STK giữa A và B (kể cả STK đã từng dùng trong lịch sử rút tiền để chống đổi STK sau khi rút)
      if (
        (length(coalesce(v_a_bank, '')) >= 6 and length(coalesce(v_b_bank, '')) >= 6 and v_a_bank = v_b_bank)
        or exists (
          select 1
          from (
            select regexp_replace(coalesce(bank_account_no, ''), '\D', '', 'g') as acc
            from public.user_wallets where user_id = v_ref.referrer_id
            union
            select regexp_replace(coalesce(bank_account_no, ''), '\D', '', 'g') as acc
            from public.withdrawal_requests where user_id = v_ref.referrer_id
          ) ba
          join (
            select regexp_replace(coalesce(bank_account_no, ''), '\D', '', 'g') as acc
            from public.user_wallets where user_id = v_ref.referee_id
            union
            select regexp_replace(coalesce(bank_account_no, ''), '\D', '', 'g') as acc
            from public.withdrawal_requests where user_id = v_ref.referee_id
          ) bb on ba.acc = bb.acc
          where length(ba.acc) >= 6
        )
      ) then
        v_fraud_status := 'flagged';
        if not (v_reasons ? 'same_bank_account') then
          v_reasons := v_reasons || jsonb_build_array('same_bank_account');
        end if;
      end if;

      -- Kiểm tra STK của B (hiện tại hoặc lịch sử rút) đã từng xuất hiện ở tài khoản được mời khác chưa
      select exists (
        select 1
        from (
          select regexp_replace(coalesce(bank_account_no, ''), '\D', '', 'g') as acc
          from public.user_wallets where user_id = v_ref.referee_id
          union
          select regexp_replace(coalesce(bank_account_no, ''), '\D', '', 'g') as acc
          from public.withdrawal_requests where user_id = v_ref.referee_id
        ) b_accs
        where length(b_accs.acc) >= 6
          and (
            exists (
              select 1
              from public.user_referrals r2
              join public.user_wallets w2 on w2.user_id = r2.referee_id
              where r2.id <> v_ref.id
                and r2.referee_id <> v_ref.referee_id
                and r2.status in ('locked', 'unlocked', 'review_pending')
                and regexp_replace(coalesce(w2.bank_account_no, ''), '\D', '', 'g') = b_accs.acc
            )
            or exists (
              select 1
              from public.user_referrals r2
              join public.withdrawal_requests wr2 on wr2.user_id = r2.referee_id
              where r2.id <> v_ref.id
                and r2.referee_id <> v_ref.referee_id
                and r2.status in ('locked', 'unlocked', 'review_pending')
                and regexp_replace(coalesce(wr2.bank_account_no, ''), '\D', '', 'g') = b_accs.acc
            )
          )
      ) into v_bank_used_elsewhere;

      if v_bank_used_elsewhere then
        v_fraud_status := 'flagged';
        if not (v_reasons ? 'bank_account_already_claimed') then
          v_reasons := v_reasons || jsonb_build_array('bank_account_already_claimed');
        end if;
      end if;
    end if;

    if v_block_same_device then
      select exists (
        select 1
        from public.user_device_signals sa
        join public.user_device_signals sb
          on (
            sa.device_id = sb.device_id
            or (sa.fingerprint_hash is not null and sa.fingerprint_hash <> '' and sa.fingerprint_hash = sb.fingerprint_hash)
          )
        where sa.user_id = v_ref.referrer_id
          and sb.user_id = v_ref.referee_id
      ) into v_shared_device;

      if v_shared_device then
        v_fraud_status := 'flagged';
        if not (v_reasons ? 'shared_device_detected') then
          v_reasons := v_reasons || jsonb_build_array('shared_device_detected');
        end if;
      end if;
    end if;

    -- Nếu có cờ cảnh báo gian lận -> chuyển sang review_pending để Admin duyệt tay
    if v_fraud_status <> 'clean' then
      update public.user_referrals
      set
        status = 'review_pending',
        fraud_status = 'flagged',
        fraud_reasons = v_reasons,
        updated_at = now()
      where id = v_ref.id;
      v_review := v_review + 1;
      continue;
    end if;

    -- Case D: Hợp lệ hoàn toàn -> Mở khóa nguyên tử cho CẢ A và B (Đang khóa -> Khả dụng)
    select locked_balance into v_a_locked_cur from public.user_wallets where user_id = v_ref.referrer_id;
    select locked_balance into v_b_locked_cur from public.user_wallets where user_id = v_ref.referee_id;
    v_a_deduct := least(coalesce(v_a_locked_cur, 0), v_ref.referrer_reward);
    v_b_deduct := least(coalesce(v_b_locked_cur, 0), v_ref.referee_reward);

    update public.user_referrals
    set
      status = 'unlocked',
      unlocked_at = now(),
      updated_at = now()
    where id = v_ref.id;

    if v_ref.referrer_reward > 0 then
      update public.user_wallets
      set
        locked_balance = locked_balance - v_a_deduct,
        balance = balance + v_ref.referrer_reward,
        updated_at = now()
      where user_id = v_ref.referrer_id;

      perform public.append_wallet_ledger(
        v_ref.referrer_id, 'referral_unlocked',
        v_ref.referrer_reward, 0, -v_a_deduct, 0,
        'referral', v_ref.id::text, 'ref_unlock:' || v_ref.id::text || ':referrer',
        'system', 'referral_engine',
        'Mở khóa thưởng giới thiệu bạn bè sang số dư khả dụng',
        jsonb_build_object(
          'role', 'referrer',
          'referee_id', v_ref.referee_id,
          'referrer_qualifying', v_a_qual,
          'referee_qualifying', v_b_qual
        )
      );
    end if;

    if v_ref.referee_reward > 0 then
      update public.user_wallets
      set
        locked_balance = locked_balance - v_b_deduct,
        balance = balance + v_ref.referee_reward,
        updated_at = now()
      where user_id = v_ref.referee_id;

      perform public.append_wallet_ledger(
        v_ref.referee_id, 'referral_unlocked',
        v_ref.referee_reward, 0, -v_b_deduct, 0,
        'referral', v_ref.id::text, 'ref_unlock:' || v_ref.id::text || ':referee',
        'system', 'referral_engine',
        'Mở khóa thưởng chào mừng người được mời sang số dư khả dụng',
        jsonb_build_object(
          'role', 'referee',
          'referrer_id', v_ref.referrer_id,
          'referrer_qualifying', v_a_qual,
          'referee_qualifying', v_b_qual
        )
      );
    end if;

    v_unlocked := v_unlocked + 1;
  end loop;

  return jsonb_build_object('unlocked', v_unlocked, 'review_pending', v_review, 'expired', v_expired);
end;
$$;

revoke all on function public.evaluate_referral_unlocks_for_user(uuid) from public, anon, authenticated;
grant execute on function public.evaluate_referral_unlocks_for_user(uuid) to service_role;

-- ============================================================================
-- 9. Hàm đăng ký lượt giới thiệu mới + chống spam Device ID / Fingerprint / Email / IP
-- ============================================================================
create or replace function public.register_user_referral(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_referrer_id uuid := (p_payload->>'referrer_id')::uuid;
  v_referee_id uuid := (p_payload->>'referee_id')::uuid;
  v_ref_code text := trim(coalesce(p_payload->>'ref_code', ''));
  v_referee_email text := lower(trim(coalesce(p_payload->>'referee_email_normalized', '')));
  v_referrer_email text := lower(trim(coalesce(p_payload->>'referrer_email_normalized', '')));
  v_device_id text := trim(coalesce(p_payload->>'device_id', ''));
  v_fp_hash text := trim(coalesce(p_payload->>'fingerprint_hash', ''));
  v_ip_hash text := trim(coalesce(p_payload->>'ip_hash', ''));
  v_cfg jsonb := '{}'::jsonb;
  v_enabled boolean := true;
  v_referrer_reward bigint := 10000;
  v_referee_reward bigint := 10000;
  v_referrer_min bigint := 50000;
  v_referee_min bigint := 50000;
  v_expiry_days int := 90;
  v_block_same_device boolean := true;
  v_flag_ip_hours int := 24;
  v_max_ip_7d int := 3;
  v_max_account_age_days int := 1;
  v_referee_created_at timestamptz;
  v_fraud_status text := 'clean';
  v_fraud_reasons jsonb := '[]'::jsonb;
  v_ip_count int := 0;
  v_first_uid uuid;
  v_second_uid uuid;
  v_saved public.user_referrals%rowtype;
begin
  if v_referrer_id is null or v_referee_id is null then
    return jsonb_build_object('success', false, 'code', 'invalid_users', 'error', 'Thiếu thông tin tài khoản giới thiệu.');
  end if;

  if v_referrer_id = v_referee_id then
    return jsonb_build_object('success', false, 'code', 'self_referral_not_allowed', 'error', 'Bạn không thể tự giới thiệu chính mình.');
  end if;

  -- Khóa tuần tự theo referee để chống đăng ký lặp
  perform pg_advisory_xact_lock(hashtextextended('ref_claim:' || v_referee_id::text, 0));

  select settings into v_cfg from public.app_settings where id = 'referral_program';
  v_enabled := coalesce((v_cfg->>'enabled')::boolean, true);
  v_referrer_reward := greatest(0, coalesce((v_cfg->>'referrerReward')::bigint, 10000));
  v_referee_reward := greatest(0, coalesce((v_cfg->>'refereeReward')::bigint, 10000));
  v_referrer_min := greatest(0, coalesce((v_cfg->>'referrerMinQualifyingCashback')::bigint, 50000));
  v_referee_min := greatest(0, coalesce((v_cfg->>'refereeMinQualifyingCashback')::bigint, 50000));
  v_expiry_days := greatest(1, least(365, coalesce((v_cfg->>'expiryDays')::int, 90)));
  v_block_same_device := coalesce((v_cfg->>'blockSameDevice')::boolean, true);
  v_flag_ip_hours := greatest(1, coalesce((v_cfg->>'flagSameIpHours')::int, 24));
  v_max_ip_7d := greatest(1, coalesce((v_cfg->>'maxReferralsPerIp7d')::int, 3));
  v_max_account_age_days := greatest(0, least(3650, coalesce((v_cfg->>'maxAccountAgeDays')::int, 1)));

  if not v_enabled then
    return jsonb_build_object('success', false, 'code', 'referral_disabled', 'error', 'Chương trình giới thiệu hiện đang tạm dừng.');
  end if;

  -- 1. Kiểm tra B đã có người giới thiệu trước đó chưa
  if exists (select 1 from public.user_referrals where referee_id = v_referee_id) then
    return jsonb_build_object('success', false, 'code', 'already_referred', 'error', 'Tài khoản này đã được gắn mã giới thiệu trước đó.');
  end if;

  -- 1B. Chặn giới thiệu chéo hoặc vòng tròn (A -> B -> ... -> A)
  if exists (
    with recursive chain as (
      select r.referrer_id, r.referee_id, 1 as depth
      from public.user_referrals r
      where r.referee_id = v_referrer_id
        and r.status <> 'revoked'
      union all
      select r.referrer_id, r.referee_id, c.depth + 1
      from public.user_referrals r
      join chain c on r.referee_id = c.referrer_id
      where r.status <> 'revoked'
        and c.depth < 10
    )
    select 1 from chain where referrer_id = v_referee_id
  ) then
    return jsonb_build_object('success', false, 'code', 'reciprocal_referral_not_allowed', 'error', 'Không thể giới thiệu chéo hoặc theo vòng tròn giữa các tài khoản.');
  end if;

  -- 2. Kiểm tra B chưa có đơn hàng trước đó và chưa có hoạt động ví (chỉ áp dụng tài khoản mới)
  if exists (select 1 from public.cashback_orders where user_id = v_referee_id) then
    return jsonb_build_object('success', false, 'code', 'existing_orders_not_eligible', 'error', 'Chỉ tài khoản mới chưa phát sinh đơn hàng mới được áp dụng mã giới thiệu.');
  end if;

  if exists (
    select 1 from public.user_wallets
    where user_id = v_referee_id
      and (balance > 0 or pending_balance > 0 or total_withdrawn > 0)
  ) then
    return jsonb_build_object('success', false, 'code', 'existing_wallet_activity_not_eligible', 'error', 'Tài khoản đã có lịch sử giao dịch ví nên không đủ điều kiện áp dụng mã giới thiệu.');
  end if;

  -- 2B. Kiểm tra tuổi tài khoản tối đa (chống tài khoản cũ tạo từ nhiều tháng trước nhập mã mời)
  if v_max_account_age_days > 0 then
    select created_at into v_referee_created_at from auth.users where id = v_referee_id;
    if v_referee_created_at is not null
       and v_referee_created_at < now() - make_interval(days => v_max_account_age_days) then
      return jsonb_build_object(
        'success', false,
        'code', 'account_too_old_for_referral',
        'error', 'Chỉ tài khoản đăng ký mới trong vòng ' || v_max_account_age_days::text || ' ngày mới được nhập mã giới thiệu.'
      );
    end if;
  end if;

  -- 3. Chống trùng email chuẩn hóa (Gmail dot / plus alias)
  if v_referee_email <> '' then
    if v_referrer_email <> '' and v_referee_email = v_referrer_email then
      return jsonb_build_object('success', false, 'code', 'duplicate_email_self', 'error', 'Email tài khoản được mời trùng với người giới thiệu.');
    end if;
    if exists (
      select 1 from public.user_referrals
      where referee_email_normalized = v_referee_email
        and status <> 'revoked'
    ) then
      return jsonb_build_object('success', false, 'code', 'duplicate_email_already_claimed', 'error', 'Email này đã từng nhận ưu đãi giới thiệu trước đó.');
    end if;
  end if;

  -- 4. Chặn cứng trùng thiết bị (Device ID / Browser Fingerprint) & chống bypass gọi API trống tín hiệu
  if v_block_same_device then
    if v_device_id = '' and v_fp_hash = '' then
      return jsonb_build_object(
        'success', false,
        'code', 'missing_device_signal',
        'error', 'Không xác minh được thiết bị trình duyệt. Vui lòng bật Cookie/JavaScript và thử lại trên trình duyệt.'
      );
    end if;

    if v_device_id = '' then
      v_fraud_status := 'flagged';
      if not (v_fraud_reasons ? 'missing_device_id_signal') then
        v_fraud_reasons := v_fraud_reasons || jsonb_build_array('missing_device_id_signal');
      end if;
    end if;

    if v_fp_hash = '' then
      v_fraud_status := 'flagged';
      if not (v_fraud_reasons ? 'missing_fingerprint_signal') then
        v_fraud_reasons := v_fraud_reasons || jsonb_build_array('missing_fingerprint_signal');
      end if;
    end if;

    if v_device_id <> '' then
      if exists (
        select 1 from public.user_device_signals
        where user_id = v_referrer_id and device_id = v_device_id
      ) then
        return jsonb_build_object('success', false, 'code', 'same_device_detected', 'error', 'Phát hiện cùng thiết bị với người giới thiệu — không thể nhận thưởng tự giới thiệu.');
      end if;

      if exists (
        select 1 from public.user_referrals
        where referee_device_id = v_device_id
          and referee_id <> v_referee_id
      ) then
        return jsonb_build_object('success', false, 'code', 'device_already_claimed_referral', 'error', 'Thiết bị này đã từng nhận thưởng giới thiệu cho một tài khoản khác.');
      end if;
    end if;

    if v_fp_hash <> '' then
      if exists (
        select 1 from public.user_device_signals
        where user_id = v_referrer_id and fingerprint_hash = v_fp_hash
      ) then
        return jsonb_build_object('success', false, 'code', 'same_device_fingerprint_detected', 'error', 'Phát hiện cùng trình duyệt/thiết bị với người giới thiệu — không thể nhận thưởng tự giới thiệu.');
      end if;

      if exists (
        select 1 from public.user_referrals
        where referee_fingerprint_hash = v_fp_hash
          and referee_id <> v_referee_id
      ) then
        return jsonb_build_object('success', false, 'code', 'fingerprint_already_claimed_referral', 'error', 'Thiết bị này đã từng nhận thưởng giới thiệu trước đó.');
      end if;
    end if;

    -- Đối chiếu chéo lịch sử user_device_signals của B (chống trường hợp gửi payload device_id giả sau khi đã đăng nhập chung máy với A)
    if exists (
      select 1
      from public.user_device_signals sb
      join public.user_device_signals sa
        on (
          sb.device_id = sa.device_id
          or (sb.fingerprint_hash is not null and sb.fingerprint_hash <> '' and sb.fingerprint_hash = sa.fingerprint_hash)
        )
      where sb.user_id = v_referee_id
        and sa.user_id = v_referrer_id
    ) then
      return jsonb_build_object('success', false, 'code', 'same_device_detected', 'error', 'Phát hiện lịch sử đăng nhập cùng thiết bị với người giới thiệu — không thể nhận thưởng.');
    end if;

    if exists (
      select 1
      from public.user_device_signals sb
      join public.user_referrals r_prev
        on (
          (r_prev.referee_device_id is not null and r_prev.referee_device_id = sb.device_id)
          or (r_prev.referee_fingerprint_hash is not null and sb.fingerprint_hash is not null and sb.fingerprint_hash <> '' and r_prev.referee_fingerprint_hash = sb.fingerprint_hash)
        )
      where sb.user_id = v_referee_id
        and r_prev.referee_id <> v_referee_id
    ) then
      return jsonb_build_object('success', false, 'code', 'device_already_claimed_referral', 'error', 'Thiết bị này đã từng nhận thưởng giới thiệu cho một tài khoản khác.');
    end if;

    -- Gắn cờ duyệt tay nếu thiết bị/fingerprint này từng đăng nhập 1 tài khoản DealHoàn khác (không phải A, không phải B)
    if exists (
      select 1
      from public.user_device_signals sx
      where sx.user_id <> v_referee_id
        and sx.user_id <> v_referrer_id
        and (
          (v_device_id <> '' and sx.device_id = v_device_id)
          or (v_fp_hash <> '' and sx.fingerprint_hash = v_fp_hash)
        )
    ) then
      v_fraud_status := 'flagged';
      if not (v_fraud_reasons ? 'device_used_by_other_account') then
        v_fraud_reasons := v_fraud_reasons || jsonb_build_array('device_used_by_other_account');
      end if;
    end if;
  end if;

  -- 5. Lớp 2: Kiểm tra trùng IP -> gắn cờ cảnh báo để Admin duyệt (không chặn oan bạn bè chung Wi-Fi)
  if v_ip_hash <> '' then
    if exists (
      select 1 from public.user_device_signals
      where user_id = v_referrer_id
        and ip_hash = v_ip_hash
        and last_seen_at >= now() - make_interval(hours => v_flag_ip_hours)
    ) then
      v_fraud_status := 'flagged';
      if not (v_fraud_reasons ? 'same_ip_within_24h') then
        v_fraud_reasons := v_fraud_reasons || jsonb_build_array('same_ip_within_24h');
      end if;
    end if;

    select count(*)::int into v_ip_count
    from public.user_referrals
    where signup_ip_hash = v_ip_hash
      and created_at >= now() - interval '7 days';

    if v_ip_count >= v_max_ip_7d then
      v_fraud_status := 'flagged';
      if not (v_fraud_reasons ? 'ip_velocity_exceeded') then
        v_fraud_reasons := v_fraud_reasons || jsonb_build_array('ip_velocity_exceeded');
      end if;
    end if;
  end if;

  -- 6. Khóa 2 ví theo thứ tự UUID tăng dần & cộng +10.000đ Đang khóa nguyên tử + ghi Sổ cái
  v_first_uid := least(v_referrer_id, v_referee_id);
  v_second_uid := greatest(v_referrer_id, v_referee_id);
  insert into public.user_wallets(user_id) values(v_first_uid) on conflict(user_id) do nothing;
  insert into public.user_wallets(user_id) values(v_second_uid) on conflict(user_id) do nothing;
  perform 1 from public.user_wallets where user_id = v_first_uid for update;
  perform 1 from public.user_wallets where user_id = v_second_uid for update;

  insert into public.user_referrals (
    referrer_id, referee_id, ref_code, status,
    referrer_reward, referee_reward,
    referrer_min_qualifying, referee_min_qualifying,
    fraud_status, fraud_reasons,
    referee_email_normalized, referee_device_id, referee_fingerprint_hash, signup_ip_hash,
    expires_at
  ) values (
    v_referrer_id, v_referee_id,
    coalesce(nullif(v_ref_code, ''), 'u_' || left(v_referrer_id::text, 8)),
    'locked',
    v_referrer_reward, v_referee_reward,
    v_referrer_min, v_referee_min,
    v_fraud_status, v_fraud_reasons,
    nullif(v_referee_email, ''), nullif(v_device_id, ''), nullif(v_fp_hash, ''), nullif(v_ip_hash, ''),
    now() + make_interval(days => v_expiry_days)
  )
  returning * into v_saved;

  if v_referrer_reward > 0 then
    update public.user_wallets
    set locked_balance = locked_balance + v_referrer_reward, updated_at = now()
    where user_id = v_referrer_id;

    perform public.append_wallet_ledger(
      v_referrer_id, 'referral_locked',
      0, 0, v_referrer_reward, 0,
      'referral', v_saved.id::text, 'ref_lock:' || v_saved.id::text || ':referrer',
      'system', 'referral_engine',
      'Cộng thưởng giới thiệu bạn mới vào số dư đang khóa',
      jsonb_build_object(
        'role', 'referrer',
        'referee_id', v_referee_id,
        'ref_code', v_saved.ref_code,
        'min_qualifying_referrer', v_referrer_min,
        'min_qualifying_referee', v_referee_min,
        'expires_at', v_saved.expires_at,
        'fraud_status', v_fraud_status
      )
    );
  end if;

  if v_referee_reward > 0 then
    update public.user_wallets
    set locked_balance = locked_balance + v_referee_reward, updated_at = now()
    where user_id = v_referee_id;

    perform public.append_wallet_ledger(
      v_referee_id, 'referral_locked',
      0, 0, v_referee_reward, 0,
      'referral', v_saved.id::text, 'ref_lock:' || v_saved.id::text || ':referee',
      'system', 'referral_engine',
      'Cộng thưởng chào mừng đăng ký qua mã giới thiệu vào số dư đang khóa',
      jsonb_build_object(
        'role', 'referee',
        'referrer_id', v_referrer_id,
        'ref_code', v_saved.ref_code,
        'min_qualifying_referrer', v_referrer_min,
        'min_qualifying_referee', v_referee_min,
        'expires_at', v_saved.expires_at,
        'fraud_status', v_fraud_status
      )
    );
  end if;

  return jsonb_build_object('success', true, 'referral', to_jsonb(v_saved));
end;
$$;

revoke all on function public.register_user_referral(jsonb) from public, anon, authenticated;
grant execute on function public.register_user_referral(jsonb) to service_role;

-- ============================================================================
-- 10. Hàm quét hết hạn hàng loạt cho cron / admin (expire_overdue_referrals)
-- ============================================================================
create or replace function public.expire_overdue_referrals()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ref public.user_referrals%rowtype;
  v_first_uid uuid;
  v_second_uid uuid;
  v_a_locked bigint;
  v_b_locked bigint;
  v_a_deduct bigint;
  v_b_deduct bigint;
  v_count int := 0;
begin
  for v_ref in
    select *
    from public.user_referrals
    where status in ('locked', 'review_pending')
      and now() >= expires_at
    order by expires_at asc
    limit 200
    for update skip locked
  loop
    v_first_uid := least(v_ref.referrer_id, v_ref.referee_id);
    v_second_uid := greatest(v_ref.referrer_id, v_ref.referee_id);
    insert into public.user_wallets(user_id) values(v_first_uid) on conflict(user_id) do nothing;
    insert into public.user_wallets(user_id) values(v_second_uid) on conflict(user_id) do nothing;
    perform 1 from public.user_wallets where user_id = v_first_uid for update;
    perform 1 from public.user_wallets where user_id = v_second_uid for update;

    select locked_balance into v_a_locked from public.user_wallets where user_id = v_ref.referrer_id;
    select locked_balance into v_b_locked from public.user_wallets where user_id = v_ref.referee_id;
    v_a_deduct := least(coalesce(v_a_locked, 0), v_ref.referrer_reward);
    v_b_deduct := least(coalesce(v_b_locked, 0), v_ref.referee_reward);

    update public.user_referrals
    set status = 'expired', expired_at = now(), updated_at = now()
    where id = v_ref.id;

    if v_a_deduct > 0 then
      update public.user_wallets
      set locked_balance = locked_balance - v_a_deduct, updated_at = now()
      where user_id = v_ref.referrer_id;

      perform public.append_wallet_ledger(
        v_ref.referrer_id, 'referral_expired',
        0, 0, -v_a_deduct, 0,
        'referral', v_ref.id::text, 'ref_exp:' || v_ref.id::text || ':referrer',
        'cron', 'expire_overdue_referrals',
        'Hết hạn mở khóa thưởng giới thiệu (người giới thiệu)',
        jsonb_build_object('role', 'referrer', 'referee_id', v_ref.referee_id)
      );
    end if;

    if v_b_deduct > 0 then
      update public.user_wallets
      set locked_balance = locked_balance - v_b_deduct, updated_at = now()
      where user_id = v_ref.referee_id;

      perform public.append_wallet_ledger(
        v_ref.referee_id, 'referral_expired',
        0, 0, -v_b_deduct, 0,
        'referral', v_ref.id::text, 'ref_exp:' || v_ref.id::text || ':referee',
        'cron', 'expire_overdue_referrals',
        'Hết hạn mở khóa thưởng chào mừng giới thiệu (người được mời)',
        jsonb_build_object('role', 'referee', 'referrer_id', v_ref.referrer_id)
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('expired_count', v_count);
end;
$$;

revoke all on function public.expire_overdue_referrals() from public, anon, authenticated;
grant execute on function public.expire_overdue_referrals() to service_role;

-- ============================================================================
-- 11. Hàm Admin duyệt hoặc thu hồi thưởng giới thiệu (admin_decide_referral)
-- ============================================================================
create or replace function public.admin_decide_referral(
  p_referral_id uuid,
  p_action text,
  p_admin_email text default 'admin',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ref public.user_referrals%rowtype;
  v_first_uid uuid;
  v_second_uid uuid;
  v_a_locked bigint;
  v_b_locked bigint;
  v_a_deduct bigint;
  v_b_deduct bigint;
  v_note text;
begin
  if p_referral_id is null or p_action not in ('approve', 'revoke') then
    raise exception 'invalid_referral_decision';
  end if;

  select * into v_ref from public.user_referrals where id = p_referral_id for update;
  if v_ref.id is null then
    raise exception 'referral_not_found';
  end if;
  if v_ref.status not in ('locked', 'review_pending') then
    raise exception 'referral_already_finalized';
  end if;

  v_first_uid := least(v_ref.referrer_id, v_ref.referee_id);
  v_second_uid := greatest(v_ref.referrer_id, v_ref.referee_id);
  insert into public.user_wallets(user_id) values(v_first_uid) on conflict(user_id) do nothing;
  insert into public.user_wallets(user_id) values(v_second_uid) on conflict(user_id) do nothing;
  perform 1 from public.user_wallets where user_id = v_first_uid for update;
  perform 1 from public.user_wallets where user_id = v_second_uid for update;

  select locked_balance into v_a_locked from public.user_wallets where user_id = v_ref.referrer_id;
  select locked_balance into v_b_locked from public.user_wallets where user_id = v_ref.referee_id;
  v_a_deduct := least(coalesce(v_a_locked, 0), v_ref.referrer_reward);
  v_b_deduct := least(coalesce(v_b_locked, 0), v_ref.referee_reward);

  if p_action = 'approve' then
    v_note := coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Admin duyệt mở khóa thưởng giới thiệu');

    update public.user_referrals
    set
      status = 'unlocked',
      fraud_status = 'clean',
      unlocked_at = now(),
      decided_by = coalesce(p_admin_email, 'admin'),
      decision_note = v_note,
      updated_at = now()
    where id = v_ref.id
    returning * into v_ref;

    if v_ref.referrer_reward > 0 then
      update public.user_wallets
      set locked_balance = locked_balance - v_a_deduct, balance = balance + v_ref.referrer_reward, updated_at = now()
      where user_id = v_ref.referrer_id;

      perform public.append_wallet_ledger(
        v_ref.referrer_id, 'referral_unlocked',
        v_ref.referrer_reward, 0, -v_a_deduct, 0,
        'referral', v_ref.id::text, 'ref_unlock:' || v_ref.id::text || ':referrer',
        'admin', coalesce(p_admin_email, 'admin'), v_note,
        jsonb_build_object('role', 'referrer', 'referee_id', v_ref.referee_id, 'manual_approve', true)
      );
    end if;

    if v_ref.referee_reward > 0 then
      update public.user_wallets
      set locked_balance = locked_balance - v_b_deduct, balance = balance + v_ref.referee_reward, updated_at = now()
      where user_id = v_ref.referee_id;

      perform public.append_wallet_ledger(
        v_ref.referee_id, 'referral_unlocked',
        v_ref.referee_reward, 0, -v_b_deduct, 0,
        'referral', v_ref.id::text, 'ref_unlock:' || v_ref.id::text || ':referee',
        'admin', coalesce(p_admin_email, 'admin'), v_note,
        jsonb_build_object('role', 'referee', 'referrer_id', v_ref.referrer_id, 'manual_approve', true)
      );
    end if;
  else
    v_note := coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Admin thu hồi thưởng giới thiệu do vi phạm chính sách');

    update public.user_referrals
    set
      status = 'revoked',
      fraud_status = 'blocked',
      revoked_at = now(),
      decided_by = coalesce(p_admin_email, 'admin'),
      decision_note = v_note,
      updated_at = now()
    where id = v_ref.id
    returning * into v_ref;

    if v_a_deduct > 0 then
      update public.user_wallets
      set locked_balance = locked_balance - v_a_deduct, updated_at = now()
      where user_id = v_ref.referrer_id;

      perform public.append_wallet_ledger(
        v_ref.referrer_id, 'referral_revoked',
        0, 0, -v_a_deduct, 0,
        'referral', v_ref.id::text, 'ref_revoke:' || v_ref.id::text || ':referrer',
        'admin', coalesce(p_admin_email, 'admin'), v_note,
        jsonb_build_object('role', 'referrer', 'referee_id', v_ref.referee_id)
      );
    end if;

    if v_b_deduct > 0 then
      update public.user_wallets
      set locked_balance = locked_balance - v_b_deduct, updated_at = now()
      where user_id = v_ref.referee_id;

      perform public.append_wallet_ledger(
        v_ref.referee_id, 'referral_revoked',
        0, 0, -v_b_deduct, 0,
        'referral', v_ref.id::text, 'ref_revoke:' || v_ref.id::text || ':referee',
        'admin', coalesce(p_admin_email, 'admin'), v_note,
        jsonb_build_object('role', 'referee', 'referrer_id', v_ref.referrer_id)
      );
    end if;
  end if;

  return jsonb_build_object('success', true, 'referral', to_jsonb(v_ref));
end;
$$;

revoke all on function public.admin_decide_referral(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.admin_decide_referral(uuid,text,text,text) to service_role;

-- ============================================================================
-- 12. Hàm Admin chỉnh sửa số dư ví thủ công có ghi Sổ cái (admin_adjust_wallet)
-- ============================================================================
create or replace function public.admin_adjust_wallet(
  p_user_id uuid,
  p_new_balance bigint default null,
  p_new_pending bigint default null,
  p_new_locked bigint default null,
  p_admin_email text default 'admin',
  p_note text default 'Admin điều chỉnh số dư ví'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_w public.user_wallets%rowtype;
  v_d_bal bigint := 0;
  v_d_pen bigint := 0;
  v_d_loc bigint := 0;
begin
  if p_user_id is null then
    raise exception 'invalid_user_id';
  end if;

  insert into public.user_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into v_w from public.user_wallets where user_id = p_user_id for update;

  if p_new_balance is not null then
    if p_new_balance < 0 then raise exception 'negative_balance_not_allowed'; end if;
    v_d_bal := p_new_balance - coalesce(v_w.balance, 0);
  end if;
  if p_new_pending is not null then
    if p_new_pending < 0 then raise exception 'negative_pending_not_allowed'; end if;
    v_d_pen := p_new_pending - coalesce(v_w.pending_balance, 0);
  end if;
  if p_new_locked is not null then
    if p_new_locked < 0 then raise exception 'negative_locked_not_allowed'; end if;
    v_d_loc := p_new_locked - coalesce(v_w.locked_balance, 0);
  end if;

  if v_d_bal <> 0 or v_d_pen <> 0 or v_d_loc <> 0 then
    update public.user_wallets
    set
      balance = balance + v_d_bal,
      pending_balance = pending_balance + v_d_pen,
      locked_balance = locked_balance + v_d_loc,
      updated_at = now()
    where user_id = p_user_id
    returning * into v_w;

    perform public.append_wallet_ledger(
      p_user_id, 'admin_adjustment',
      v_d_bal, v_d_pen, v_d_loc, 0,
      'admin_user_edit', p_user_id::text, null,
      'admin', coalesce(p_admin_email, 'admin'),
      coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Admin điều chỉnh số dư ví'),
      jsonb_build_object(
        'previous_balance', v_w.balance - v_d_bal,
        'previous_pending', v_w.pending_balance - v_d_pen,
        'previous_locked', v_w.locked_balance - v_d_loc
      )
    );

    -- Nếu Admin tăng số dư khả dụng, tự động kiểm tra mở khóa thưởng giới thiệu
    if v_d_bal > 0 then
      perform public.evaluate_referral_unlocks_for_user(p_user_id);
      select * into v_w from public.user_wallets where user_id = p_user_id;
    end if;
  end if;

  return jsonb_build_object('success', true, 'wallet', to_jsonb(v_w));
end;
$$;

revoke all on function public.admin_adjust_wallet(uuid,bigint,bigint,bigint,text,text) from public, anon, authenticated;
grant execute on function public.admin_adjust_wallet(uuid,bigint,bigint,bigint,text,text) to service_role;

-- ============================================================================
-- 12B. Hàm đồng bộ pending_balance nguyên tử + ghi Sổ cái (reconcile_wallet_pending_balance)
-- Dùng khi /api/wallet phát hiện tổng đơn pending lớn hơn user_wallets.pending_balance
-- ============================================================================
create or replace function public.reconcile_wallet_pending_balance(
  p_user_id uuid,
  p_actor_id text default 'wallet_sync'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_w public.user_wallets%rowtype;
  v_computed_pending bigint := 0;
  v_delta bigint := 0;
begin
  if p_user_id is null then
    raise exception 'invalid_user_id';
  end if;

  insert into public.user_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into v_w from public.user_wallets where user_id = p_user_id for update;

  select coalesce(sum(cashback_amount), 0)
    into v_computed_pending
  from public.cashback_orders
  where user_id = p_user_id
    and status = 'pending';

  if v_computed_pending > coalesce(v_w.pending_balance, 0) then
    v_delta := v_computed_pending - coalesce(v_w.pending_balance, 0);

    update public.user_wallets
    set pending_balance = v_computed_pending, updated_at = now()
    where user_id = p_user_id
    returning * into v_w;

    perform public.append_wallet_ledger(
      p_user_id, 'reconciliation_sync',
      0, v_delta, 0, 0,
      'wallet_pending_sync', p_user_id::text, null,
      'system', coalesce(nullif(trim(coalesce(p_actor_id, '')), ''), 'wallet_sync'),
      'Đồng bộ số dư chờ duyệt từ đơn hàng pending đang có',
      jsonb_build_object(
        'previous_pending', v_w.pending_balance - v_delta,
        'synced_pending', v_w.pending_balance
      )
    );

    return jsonb_build_object(
      'synced', true,
      'pending_balance', v_w.pending_balance,
      'delta_pending', v_delta
    );
  end if;

  return jsonb_build_object(
    'synced', false,
    'pending_balance', coalesce(v_w.pending_balance, 0),
    'delta_pending', 0
  );
end;
$$;

revoke all on function public.reconcile_wallet_pending_balance(uuid,text) from public, anon, authenticated;
grant execute on function public.reconcile_wallet_pending_balance(uuid,text) to service_role;

-- ============================================================================
-- 13. Nâng cấp các RPC tiền tệ hiện có để GHI SỔ CÁI NGUYÊN TỬ + TỰ MỞ KHÓA REFERRAL
-- ============================================================================

-- 13A. record_cashback_order: ghi nhận đơn + cộng ví + ghi Sổ cái + kích hoạt mở khóa giới thiệu
create or replace function public.record_cashback_order(p_order jsonb)
returns jsonb language plpgsql security invoker set search_path=public, pg_catalog as $$
declare
  previous public.cashback_orders%rowtype;
  saved public.cashback_orders%rowtype;
  uid uuid := (p_order->>'user_id')::uuid;
  oid text := trim(p_order->>'order_id');
  market text := p_order->>'platform';
  state text := p_order->>'status';
  commission bigint;
  cashback bigint;
  old_pending bigint := 0;
  old_balance bigint := 0;
  new_pending bigint := 0;
  new_balance bigint := 0;
  d_balance bigint := 0;
  d_pending bigint := 0;
  v_entry_type text;
begin
  if oid is null or length(oid) not between 1 and 128 or uid is null
     or market is null or market not in ('Shopee','ShopeeFood','TikTok Shop','Lazada')
     or state is null or state not in ('pending','completed','rejected') then
    raise exception 'invalid_order';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(market||':'||oid,0));
  select * into previous from public.cashback_orders where order_id=oid and platform=market for update;
  if previous.id is not null and previous.user_id <> uid then raise exception 'order_owner_mismatch'; end if;
  if previous.id is null and p_order->>'commission_amount' is null then raise exception 'missing_commission'; end if;
  commission := coalesce((p_order->>'commission_amount')::bigint,previous.commission_amount,0);
  cashback := coalesce((p_order->>'cashback_amount')::bigint,previous.cashback_amount,0);
  if commission<0 or cashback<0 or cashback>commission or coalesce((p_order->>'order_value')::bigint,0)<0 then
    raise exception 'invalid_amount';
  end if;

  if previous.status='pending' then old_pending:=previous.cashback_amount;
  elsif previous.status='completed' then old_balance:=previous.cashback_amount; end if;
  if state='pending' then new_pending:=cashback;
  elsif state='completed' then new_balance:=cashback; end if;

  d_balance := new_balance - old_balance;
  d_pending := new_pending - old_pending;

  insert into public.user_wallets(user_id) values(uid) on conflict(user_id) do nothing;
  perform 1 from public.user_wallets where user_id=uid for update;
  if exists(select 1 from public.user_wallets where user_id=uid and
    (balance+d_balance<0 or pending_balance+d_pending<0)) then
    raise exception 'wallet_reconciliation_required';
  end if;

  update public.user_wallets
  set balance=balance+d_balance,
      pending_balance=pending_balance+d_pending,
      updated_at=now()
  where user_id=uid;

  insert into public.cashback_orders(user_id,order_id,platform,product_name,product_image,order_value,
    commission_amount,cashback_amount,cashback_rate,status,sub_id,note,ordered_at,confirmed_at)
  values(uid,oid,market,coalesce(nullif(p_order->>'product_name',''),previous.product_name,'Sản phẩm mua qua DealHoàn'),
    coalesce(p_order->>'product_image',previous.product_image),coalesce((p_order->>'order_value')::bigint,previous.order_value,0),
    commission,cashback,case when commission>0 then round(cashback::numeric/commission*100,2) else 0 end,state,
    coalesce(p_order->>'sub_id',previous.sub_id),coalesce(p_order->>'note',previous.note),
    coalesce((p_order->>'ordered_at')::timestamptz,previous.ordered_at,now()),
    case when state='completed' then coalesce(previous.confirmed_at,now()) else null end)
  on conflict(order_id,platform) do update set product_name=excluded.product_name,product_image=excluded.product_image,
    order_value=excluded.order_value,commission_amount=excluded.commission_amount,cashback_amount=excluded.cashback_amount,
    cashback_rate=excluded.cashback_rate,status=excluded.status,sub_id=excluded.sub_id,note=excluded.note,
    ordered_at=excluded.ordered_at,confirmed_at=excluded.confirmed_at,updated_at=now()
  returning * into saved;

  -- Chỉ ghi Sổ cái khi có biến động số tiền thực sự (retry y nguyên sẽ không tạo dòng trùng)
  if d_balance <> 0 or d_pending <> 0 then
    if state = 'rejected' then
      v_entry_type := 'cashback_rejected';
    elsif previous.id is null and state = 'pending' then
      v_entry_type := 'cashback_pending';
    elsif (previous.id is null or previous.status <> 'completed') and state = 'completed' then
      v_entry_type := 'cashback_settled';
    elsif previous.status = 'completed' and state = 'pending' then
      v_entry_type := 'cashback_reverted';
    else
      v_entry_type := 'cashback_adjusted';
    end if;

    perform public.append_wallet_ledger(
      uid,
      v_entry_type,
      d_balance,
      d_pending,
      0,
      0,
      'cashback_order',
      market || ':' || oid,
      null,
      coalesce(nullif(p_order->>'actor_type', ''), 'system'),
      nullif(p_order->>'actor_id', ''),
      coalesce(saved.note, 'Cập nhật tiền hoàn đơn hàng ' || oid),
      jsonb_build_object(
        'order_id', oid,
        'platform', market,
        'previous_status', previous.status,
        'new_status', state,
        'order_value', saved.order_value,
        'commission_amount', commission,
        'cashback_amount', cashback,
        'cashback_rate', saved.cashback_rate
      )
    );
  end if;

  -- Nếu đơn vừa hoàn tất (vào số dư khả dụng), kiểm tra tự động mở khóa thưởng giới thiệu
  if state = 'completed' and d_balance > 0 then
    perform public.evaluate_referral_unlocks_for_user(uid);
  end if;

  return to_jsonb(saved);
end $$;

revoke all on function public.record_cashback_order(jsonb) from public, anon, authenticated;
grant execute on function public.record_cashback_order(jsonb) to service_role;

-- 13B. create_withdrawal_request: trừ ví + tạo lệnh rút + ghi Sổ cái nguyên tử
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
  if p_user_id is null or p_amount is null or p_amount < 10000 or p_amount > 50000000 or (p_amount % 1000 <> 0) then
    raise exception 'invalid_withdrawal_amount';
  end if;

  if p_bank_name is null or p_bank_account_no is null or p_bank_account_name is null then
    raise exception 'missing_bank_info';
  end if;

  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'unauthorized_withdrawal_user';
  end if;

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

  insert into public.withdrawal_requests (
    id, user_id, amount, bank_name, bank_account_no, bank_account_name,
    status, note, created_at, updated_at
  ) values (
    v_req_id, p_user_id, p_amount, p_bank_name, p_bank_account_no, upper(p_bank_account_name),
    'pending', 'Đang chờ đối soát & chuyển khoản qua Napas247', now(), now()
  )
  returning * into v_new_req;

  update public.user_wallets
  set
    balance = balance - p_amount,
    total_withdrawn = total_withdrawn + p_amount,
    updated_at = now()
  where user_id = p_user_id;

  perform public.append_wallet_ledger(
    p_user_id, 'withdrawal_requested',
    -p_amount, 0, 0, p_amount,
    'withdrawal_request', v_req_id::text, 'wd_req:' || v_req_id::text,
    'user', p_user_id::text,
    'Yêu cầu rút ' || p_amount::text || 'đ về ' || p_bank_name || ' (' || p_bank_account_no || ')',
    jsonb_build_object(
      'withdrawal_id', v_req_id,
      'amount', p_amount,
      'bank_name', p_bank_name,
      'bank_account_no', p_bank_account_no,
      'bank_account_name', upper(p_bank_account_name)
    )
  );

  return jsonb_build_object(
    'success', true,
    'request', row_to_json(v_new_req),
    'new_balance', v_wallet.balance - p_amount
  );
end;
$$;

revoke all on function public.create_withdrawal_request(uuid,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.create_withdrawal_request(uuid,bigint,text,text,text) to service_role;

-- 13C. process_withdrawal_decision: duyệt / từ chối lệnh rút + ghi Sổ cái nguyên tử (ghi rõ actor_id thật của Admin)
drop function if exists public.process_withdrawal_decision(uuid,text,text);
create or replace function public.process_withdrawal_decision(
  p_withdrawal_id uuid,
  p_status text,
  p_note text default null,
  p_actor_id text default 'admin'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_req public.withdrawal_requests%rowtype;
  v_wallet public.user_wallets%rowtype;
  v_note text;
  v_actor text;
  v_withdrawn_deduct bigint := 0;
begin
  if p_withdrawal_id is null or p_status not in ('completed', 'rejected') then
    raise exception 'invalid_decision_parameters';
  end if;

  select * into v_req
  from public.withdrawal_requests
  where id = p_withdrawal_id
  for update;

  if v_req.id is null then
    raise exception 'withdrawal_not_found';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'withdrawal_already_processed';
  end if;

  v_note := coalesce(
    nullif(trim(coalesce(p_note, '')), ''),
    case when p_status = 'completed' then 'Đã chuyển khoản Napas247 thành công' else 'Thông tin tài khoản ngân hàng chưa chính xác' end
  );
  v_actor := coalesce(nullif(trim(coalesce(p_actor_id, '')), ''), 'admin');

  -- Khóa ví trước khi cập nhật & ghi sổ cái
  select * into v_wallet from public.user_wallets where user_id = v_req.user_id for update;
  if v_wallet.user_id is null then
    insert into public.user_wallets(user_id) values(v_req.user_id) on conflict(user_id) do nothing;
    select * into v_wallet from public.user_wallets where user_id = v_req.user_id for update;
  end if;

  update public.withdrawal_requests
  set status = p_status, note = v_note, updated_at = now()
  where id = p_withdrawal_id;

  if p_status = 'rejected' and v_req.amount > 0 then
    -- Luôn trừ đúng số thực trừ để delta_withdrawn khớp 100% với user_wallets.total_withdrawn
    v_withdrawn_deduct := least(coalesce(v_wallet.total_withdrawn, 0), v_req.amount);

    update public.user_wallets
    set
      balance = balance + v_req.amount,
      total_withdrawn = total_withdrawn - v_withdrawn_deduct,
      updated_at = now()
    where user_id = v_req.user_id;

    perform public.append_wallet_ledger(
      v_req.user_id, 'withdrawal_rejected',
      v_req.amount, 0, 0, -v_withdrawn_deduct,
      'withdrawal_request', p_withdrawal_id::text, 'wd_dec:' || p_withdrawal_id::text,
      'admin', v_actor,
      'Từ chối lệnh rút & hoàn tiền về ví: ' || v_note,
      jsonb_build_object(
        'withdrawal_id', p_withdrawal_id,
        'amount', v_req.amount,
        'bank_name', v_req.bank_name,
        'bank_account_no', v_req.bank_account_no
      )
    );
  elsif p_status = 'completed' then
    perform public.append_wallet_ledger(
      v_req.user_id, 'withdrawal_completed',
      0, 0, 0, 0,
      'withdrawal_request', p_withdrawal_id::text, 'wd_dec:' || p_withdrawal_id::text,
      'admin', v_actor,
      'Xác nhận đã chuyển khoản thành công ' || v_req.amount::text || 'đ: ' || v_note,
      jsonb_build_object(
        'withdrawal_id', p_withdrawal_id,
        'amount', v_req.amount,
        'bank_name', v_req.bank_name,
        'bank_account_no', v_req.bank_account_no
      )
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'withdrawal_id', p_withdrawal_id,
    'status', p_status,
    'note', v_note
  );
end;
$$;

revoke all on function public.process_withdrawal_decision(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.process_withdrawal_decision(uuid,text,text,text) to service_role;

-- ============================================================================
-- 14. View đối soát Sổ cái vs Ví hiện tại (wallet_ledger_reconciliation)
-- ============================================================================
create or replace view public.wallet_ledger_reconciliation
with (security_invoker = true) as
select
  w.user_id,
  w.balance as wallet_balance,
  w.pending_balance as wallet_pending,
  w.locked_balance as wallet_locked,
  w.total_withdrawn as wallet_withdrawn,
  coalesce(l.sum_balance, 0)::bigint as ledger_balance,
  coalesce(l.sum_pending, 0)::bigint as ledger_pending,
  coalesce(l.sum_locked, 0)::bigint as ledger_locked,
  coalesce(l.sum_withdrawn, 0)::bigint as ledger_withdrawn,
  (w.balance - coalesce(l.sum_balance, 0))::bigint as diff_balance,
  (w.pending_balance - coalesce(l.sum_pending, 0))::bigint as diff_pending,
  (w.locked_balance - coalesce(l.sum_locked, 0))::bigint as diff_locked,
  (w.total_withdrawn - coalesce(l.sum_withdrawn, 0))::bigint as diff_withdrawn,
  coalesce(l.entry_count, 0)::bigint as ledger_entries,
  l.last_entry_at
from public.user_wallets w
left join (
  select
    user_id,
    sum(delta_balance) as sum_balance,
    sum(delta_pending) as sum_pending,
    sum(delta_locked) as sum_locked,
    sum(delta_withdrawn) as sum_withdrawn,
    count(*) as entry_count,
    max(created_at) as last_entry_at
  from public.wallet_ledger
  group by user_id
) l on l.user_id = w.user_id;

revoke all on public.wallet_ledger_reconciliation from public, anon, authenticated;
grant select on public.wallet_ledger_reconciliation to service_role;

notify pgrst, 'reload schema';

commit;
