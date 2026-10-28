-- Atomic cashback recording. No existing balance is recalculated or backfilled.
begin;
create table if not exists public.cashback_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id text not null,
  platform text not null default 'Shopee' check (platform in ('Shopee','ShopeeFood','TikTok Shop','Lazada')),
  product_name text, product_image text,
  order_value bigint not null default 0 check (order_value >= 0),
  commission_amount bigint not null default 0 check (commission_amount >= 0),
  cashback_amount bigint not null default 0 check (cashback_amount >= 0 and cashback_amount <= commission_amount),
  cashback_rate numeric(5,2) default 100,
  status text not null default 'pending' check (status in ('pending','completed','rejected')),
  sub_id text, note text,
  ordered_at timestamptz not null default now(), confirmed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint uq_order_platform unique(order_id,platform)
);
create index if not exists idx_cashback_orders_user_id on public.cashback_orders(user_id,ordered_at desc);
alter table public.cashback_orders enable row level security;
revoke all on public.cashback_orders from anon, authenticated;
grant select on public.cashback_orders to authenticated;
grant all on public.cashback_orders to service_role;
drop policy if exists "Users can view own orders" on public.cashback_orders;
create policy "Users can view own orders" on public.cashback_orders for select to authenticated using (auth.uid()=user_id);

-- A customer's missing-order report is evidence to review, never a credited conversion.
create table if not exists public.cashback_order_claims (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  order_id text not null check(length(order_id) between 1 and 128),
  platform text not null check(platform in ('Shopee','ShopeeFood','TikTok Shop','Lazada')),
  product_name text, order_value bigint not null default 0 check(order_value >= 0),
  created_at timestamptz not null default now(), unique(user_id,order_id,platform)
);
alter table public.cashback_order_claims enable row level security;
revoke all on public.cashback_order_claims from anon, authenticated;
grant select,insert on public.cashback_order_claims to authenticated;
grant all on public.cashback_order_claims to service_role;
drop policy if exists "Customers read own claims" on public.cashback_order_claims;
create policy "Customers read own claims" on public.cashback_order_claims for select to authenticated using(auth.uid()=user_id);
drop policy if exists "Customers submit own claims" on public.cashback_order_claims;
create policy "Customers submit own claims" on public.cashback_order_claims for insert to authenticated with check(auth.uid()=user_id);

-- Credential-bearing configuration is server-only, never exposed to browser roles.
create table if not exists public.shopee_sync_settings (
  id text primary key check(id='current'), settings jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.shopee_sync_settings enable row level security;
revoke all on public.shopee_sync_settings from public,anon,authenticated;
grant select,insert,update on public.shopee_sync_settings to service_role;

create or replace function public.record_cashback_order(p_order jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare
  previous public.cashback_orders%rowtype; saved public.cashback_orders%rowtype;
  uid uuid := (p_order->>'user_id')::uuid;
  oid text := trim(p_order->>'order_id'); market text := p_order->>'platform';
  state text := p_order->>'status'; commission bigint; cashback bigint;
  old_pending bigint := 0; old_balance bigint := 0; new_pending bigint := 0; new_balance bigint := 0;
begin
  if oid is null or length(oid) not between 1 and 128 or uid is null
     or market is null or market not in ('Shopee','ShopeeFood','TikTok Shop','Lazada')
     or state is null or state not in ('pending','completed','rejected') then raise exception 'invalid_order'; end if;
  -- Serializes the absent-row case too, unlike SELECT FOR UPDATE alone.
  perform pg_advisory_xact_lock(hashtextextended(market||':'||oid,0));
  select * into previous from public.cashback_orders where order_id=oid and platform=market for update;
  if previous.id is not null and previous.user_id <> uid then raise exception 'order_owner_mismatch'; end if;
  if previous.id is null and p_order->>'commission_amount' is null then raise exception 'missing_commission'; end if;
  commission := coalesce((p_order->>'commission_amount')::bigint,previous.commission_amount,0);
  cashback := coalesce((p_order->>'cashback_amount')::bigint,previous.cashback_amount,0);
  if commission<0 or cashback<0 or cashback>commission or coalesce((p_order->>'order_value')::bigint,0)<0 then raise exception 'invalid_amount'; end if;
  if previous.status='pending' then old_pending:=previous.cashback_amount;
  elsif previous.status='completed' then old_balance:=previous.cashback_amount; end if;
  if state='pending' then new_pending:=cashback;
  elsif state='completed' then new_balance:=cashback; end if;

  insert into public.user_wallets(user_id) values(uid) on conflict(user_id) do nothing;
  perform 1 from public.user_wallets where user_id=uid for update;
  -- A post-withdrawal reversal needs an explicit reconciliation, not a hidden clamp.
  if exists(select 1 from public.user_wallets where user_id=uid and
    (balance+new_balance-old_balance<0 or pending_balance+new_pending-old_pending<0)) then raise exception 'wallet_reconciliation_required'; end if;
  update public.user_wallets set balance=balance+new_balance-old_balance,
    pending_balance=pending_balance+new_pending-old_pending, updated_at=now() where user_id=uid;

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
  return to_jsonb(saved);
end $$;
revoke all on function public.record_cashback_order(jsonb) from public,anon,authenticated;
grant execute on function public.record_cashback_order(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
