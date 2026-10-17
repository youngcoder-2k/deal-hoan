-- Apply schema first. This does NOT activate any scheduled job.
begin;
create table if not exists public.xtra_feed (
  id text primary key check (id = 'current'),
  deals jsonb not null check (jsonb_typeof(deals) = 'array' and jsonb_array_length(deals) between 1 and 500),
  checked_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > checked_at)
);
alter table public.xtra_feed enable row level security;
revoke all on public.xtra_feed from public, anon, authenticated;
grant select, insert, update on public.xtra_feed to service_role;

create table if not exists public.xtra_import_lock (
  id boolean primary key default true check (id), token uuid, lease_until timestamptz
);
insert into public.xtra_import_lock(id) values(true) on conflict do nothing;
alter table public.xtra_import_lock enable row level security;
revoke all on public.xtra_import_lock from public, anon, authenticated;
grant select, update on public.xtra_import_lock to service_role;

create or replace function public.claim_xtra_import() returns uuid
language plpgsql security invoker set search_path = pg_catalog as $$
declare result uuid;
begin
  update public.xtra_import_lock set token = gen_random_uuid(), lease_until = now() + interval '3 minutes'
    where id and (lease_until is null or lease_until < now()) returning token into result;
  return result;
end $$;
create or replace function public.release_xtra_import(token uuid) returns void
language sql security invoker set search_path = pg_catalog as $$
  update public.xtra_import_lock set lease_until = null, token = null where id and token = $1;
$$;
create or replace function public.publish_xtra_import(token uuid, products jsonb, checked timestamptz, expiry timestamptz)
returns void language plpgsql security invoker set search_path = pg_catalog as $$
begin
  perform 1 from public.xtra_import_lock l where l.id and l.token = $1 and l.lease_until > now() for update;
  if not found then raise exception 'Import lease expired'; end if;
  if jsonb_typeof(products) <> 'array' or jsonb_array_length(products) not between 1 and 500
    or checked > now() + interval '1 minute' or checked < now() - interval '5 minutes'
    or expiry <= checked or expiry > checked + interval '9 hours 15 minutes' then
    raise exception 'Invalid feed';
  end if;
  insert into public.xtra_feed(id,deals,checked_at,expires_at) values('current',products,checked,expiry)
    on conflict(id) do update set deals=excluded.deals,checked_at=excluded.checked_at,expires_at=excluded.expires_at;
end $$;
revoke all on function public.claim_xtra_import() from public, anon, authenticated;
revoke all on function public.release_xtra_import(uuid) from public, anon, authenticated;
revoke all on function public.publish_xtra_import(uuid,jsonb,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_xtra_import() to service_role;
grant execute on function public.release_xtra_import(uuid) to service_role;
grant execute on function public.publish_xtra_import(uuid,jsonb,timestamptz,timestamptz) to service_role;
commit;
