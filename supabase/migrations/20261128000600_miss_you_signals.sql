create table private.miss_you_signals (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
create index miss_you_inbox_recent on private.miss_you_signals(recipient_id, created_at desc);
create index miss_you_sender_recent on private.miss_you_signals(sender_id, recipient_id, created_at desc);
revoke all on private.miss_you_signals from public, anon, authenticated;

create function public.send_miss_you(space_key uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); partner uuid;
begin
  if actor is null then return 'unavailable'; end if;
  select other.user_id into partner
  from public.spaces s
  join public.memberships mine on mine.space_id = s.id and mine.user_id = actor
  join public.memberships other on other.space_id = s.id and other.user_id <> actor
  where s.id = space_key and s.state = 'paired'
  for share of s;
  if partner is null then return 'unavailable'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text || partner::text || 'miss_you', 0));
  if exists (
    select from private.miss_you_signals
    where sender_id = actor and recipient_id = partner and created_at > now() - interval '15 minutes'
  ) then return 'cooldown'; end if;

  insert into private.miss_you_signals(space_id, sender_id, recipient_id)
    values (space_key, actor, partner);
  return 'sent';
end;
$$;

create function public.get_miss_you_inbox(space_key uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result jsonb;
begin
  if actor is null or not exists (
    select from public.spaces s join public.memberships m on m.space_id = s.id
    where s.id = space_key and s.state = 'paired' and m.user_id = actor
  ) then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', recent.id, 'created_at', recent.created_at, 'read_at', recent.read_at
  ) order by recent.created_at desc), '[]'::jsonb) into result
  from (
    select id, created_at, read_at from private.miss_you_signals
    where space_id = space_key and recipient_id = actor
    order by created_at desc limit 30
  ) recent;
  return result;
end;
$$;

create function public.read_miss_you(signal_key uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); changed uuid;
begin
  if actor is null then return false; end if;
  update private.miss_you_signals signal set read_at = now()
  where signal.id = signal_key and signal.recipient_id = actor and signal.read_at is null
    and exists (
      select from public.spaces s join public.memberships m on m.space_id = s.id
      where s.id = signal.space_id and s.state = 'paired' and m.user_id = actor
    )
  returning id into changed;
  return changed is not null;
end;
$$;

revoke execute on function public.send_miss_you(uuid), public.get_miss_you_inbox(uuid),
  public.read_miss_you(uuid) from public, anon;
grant execute on function public.send_miss_you(uuid), public.get_miss_you_inbox(uuid),
  public.read_miss_you(uuid) to authenticated;
