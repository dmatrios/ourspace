create schema if not exists private;
revoke all on schema private from public;

create table private.allowed_emails (
  email text primary key check (email = lower(trim(email)))
);

create function private.limit_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null or not exists (
    select 1 from private.allowed_emails where email = lower(trim(new.email))
  ) then
    raise exception 'Registration is limited to invited email addresses';
  end if;
  return new;
end;
$$;
create trigger ourspace_registration before insert or update of email on auth.users
for each row execute function private.limit_registration();

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete restrict,
  state text not null default 'waiting' check (state in ('waiting', 'paired', 'separated', 'retained'))
);
create table public.memberships (
  space_id uuid not null references public.spaces on delete cascade,
  user_id uuid primary key references auth.users on delete restrict
);
create index memberships_space_id on public.memberships(space_id);

create table private.invitations (
  space_id uuid primary key references public.spaces on delete cascade,
  code_hash bytea not null unique,
  expires_at timestamptz not null,
  requester_id uuid references auth.users on delete set null
);
create table private.join_attempts (
  user_id uuid primary key references auth.users on delete cascade,
  window_start timestamptz not null,
  attempts integer not null
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users on delete set null,
  space_id uuid references public.spaces on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  check (space_id is not null or owner_id is not null)
);
create index tasks_space_id on public.tasks(space_id);
create index tasks_owner_id on public.tasks(owner_id);

alter table public.spaces enable row level security;
alter table public.memberships enable row level security;
alter table public.tasks enable row level security;

revoke all on public.spaces, public.memberships, public.tasks from public, anon, authenticated;
grant select on public.spaces, public.memberships, public.tasks to authenticated;
grant insert (owner_id, space_id, title), update (completed), delete on public.tasks to authenticated;

create policy own_membership on public.memberships for select to authenticated
using (user_id = (select auth.uid()));
create policy member_space on public.spaces for select to authenticated
using (exists (select from public.memberships where space_id = spaces.id and user_id = (select auth.uid())));
create policy read_tasks on public.tasks for select to authenticated
using (
  (space_id is null and owner_id = (select auth.uid()))
  or exists (select from public.memberships where space_id = tasks.space_id and user_id = (select auth.uid()))
);
create policy add_tasks on public.tasks for insert to authenticated
with check (
  owner_id = (select auth.uid()) and (
    space_id is null or exists (
      select from public.spaces where id = tasks.space_id and state in ('paired', 'retained')
    )
  )
);
create policy complete_tasks on public.tasks for update to authenticated
using (
  (space_id is null and owner_id = (select auth.uid()))
  or exists (select from public.spaces where id = tasks.space_id and state in ('paired', 'retained'))
);
create policy remove_tasks on public.tasks for delete to authenticated
using (
  (space_id is null and owner_id = (select auth.uid()))
  or exists (select from public.spaces where id = tasks.space_id and state in ('paired', 'retained'))
);

create function public.issue_invitation() returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  home uuid;
  code text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  select space_id into home from public.memberships where user_id = actor;
  if home is null then
    insert into public.spaces(owner_id) values (actor) returning id into home;
    insert into public.memberships values (home, actor);
  else
    perform 1 from public.spaces where id = home and owner_id = actor and state = 'waiting' for update;
    if not found then raise exception 'Space cannot issue invitations'; end if;
  end if;
  code := upper(replace(gen_random_uuid()::text, '-', ''));
  insert into private.invitations(space_id, code_hash, expires_at)
    values (home, sha256(convert_to(code, 'UTF8')), now() + interval '1 day')
    on conflict (space_id) do update set code_hash = excluded.code_hash,
      expires_at = excluded.expires_at, requester_id = null;
  return code;
end;
$$;

create function public.request_invitation(invite_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  attempt_count integer;
  home uuid;
  digest bytea;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  insert into private.join_attempts values (actor, now(), 1)
    on conflict (user_id) do update set
      attempts = case when join_attempts.window_start < now() - interval '15 minutes'
        then 1 else least(join_attempts.attempts + 1, 9) end,
      window_start = case when join_attempts.window_start < now() - interval '15 minutes'
        then now() else join_attempts.window_start end
    returning attempts into attempt_count;
  if attempt_count > 8 or invite_code is null or upper(trim(invite_code)) !~ '^[0-9A-F]{32}$'
    or exists (select from public.memberships where user_id = actor) then return false; end if;
  digest := sha256(convert_to(upper(trim(invite_code)), 'UTF8'));
  select i.space_id into home from private.invitations i where i.code_hash = digest;
  perform 1 from public.spaces where id = home and state = 'waiting' and owner_id <> actor for update;
  if not found then return false; end if;
  update private.invitations set requester_id = actor
    where space_id = home and code_hash = digest and expires_at > now()
      and (requester_id is null or requester_id = actor);
  return found;
end;
$$;

create function public.pending_partner() returns text
language sql stable security definer set search_path = '' as $$
  select u.email::text from private.invitations i
    join public.spaces s on s.id = i.space_id
    join auth.users u on u.id = i.requester_id
    where s.owner_id = auth.uid() and s.state = 'waiting' and i.expires_at > now();
$$;

create function public.approve_partner(expected_email text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  home uuid;
  partner uuid;
begin
  select id into home from public.spaces where owner_id = auth.uid() and state = 'waiting' for update;
  select i.requester_id into partner from private.invitations i
    join auth.users u on u.id = i.requester_id
    where i.space_id = home and i.expires_at > now() and u.email = expected_email;
  if partner is null then return false; end if;
  insert into public.memberships values (home, partner) on conflict (user_id) do nothing;
  if not found then return false; end if;
  update public.spaces set state = 'paired' where id = home;
  delete from private.invitations where space_id = home;
  return true;
end;
$$;

create function public.leave_space() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  home uuid;
begin
  select s.id into home from public.spaces s join public.memberships m on m.space_id = s.id
    where m.user_id = actor and s.state = 'paired' for update of s;
  if home is null then return false; end if;
  delete from public.memberships where space_id = home and user_id = actor;
  update public.spaces set state = 'separated',
    owner_id = (select user_id from public.memberships where space_id = home)
    where id = home;
  delete from private.invitations where space_id = home;
  return true;
end;
$$;

create function public.export_separated_space() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('format', 1, 'space_id', s.id, 'tasks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'title', t.title, 'completed', t.completed, 'created_at', t.created_at
    ) order by t.created_at)
    from public.tasks t where t.space_id = s.id
  ), '[]'::jsonb))
  from public.spaces s where s.owner_id = auth.uid() and s.state = 'separated';
$$;

create function public.settle_space(keep_home boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  home uuid;
begin
  if keep_home is null then return false; end if;
  select id into home from public.spaces where owner_id = auth.uid() and state = 'separated' for update;
  if home is null then return false; end if;
  if keep_home then
    update public.spaces set state = 'retained' where id = home;
  else
    delete from public.spaces where id = home;
  end if;
  return true;
end;
$$;

revoke execute on function public.issue_invitation(), public.request_invitation(text), public.pending_partner(),
  public.approve_partner(text), public.leave_space(), public.export_separated_space(), public.settle_space(boolean) from public, anon;
grant execute on function public.issue_invitation(), public.request_invitation(text), public.pending_partner(),
  public.approve_partner(text), public.leave_space(), public.export_separated_space(), public.settle_space(boolean) to authenticated;
