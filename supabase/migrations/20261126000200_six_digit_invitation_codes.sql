create or replace function public.issue_invitation() returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  home uuid;
  random_id uuid;
  random_number bigint;
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

  for attempt in 1..20 loop
    random_id := gen_random_uuid();
    random_number :=
      get_byte(decode(substr(replace(random_id::text, '-', ''), 1, 8), 'hex'), 0)::bigint * 16777216 +
      get_byte(decode(substr(replace(random_id::text, '-', ''), 1, 8), 'hex'), 1)::bigint * 65536 +
      get_byte(decode(substr(replace(random_id::text, '-', ''), 1, 8), 'hex'), 2)::bigint * 256 +
      get_byte(decode(substr(replace(random_id::text, '-', ''), 1, 8), 'hex'), 3)::bigint;
    code := lpad((random_number % 1000000)::text, 6, '0');

    begin
      insert into private.invitations(space_id, code_hash, expires_at)
        values (home, sha256(convert_to(code, 'UTF8')), now() + interval '1 day')
        on conflict (space_id) do update set code_hash = excluded.code_hash,
          expires_at = excluded.expires_at, requester_id = null;
      return code;
    exception when unique_violation then
      null;
    end;
  end loop;

  raise exception 'Could not generate a unique invitation code';
end;
$$;

create or replace function public.request_invitation(invite_code text) returns boolean
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
  if attempt_count > 8 or invite_code is null or trim(invite_code) !~ '^[0-9]{6}$'
    or exists (select from public.memberships where user_id = actor) then return false; end if;
  digest := sha256(convert_to(trim(invite_code), 'UTF8'));
  select i.space_id into home from private.invitations i where i.code_hash = digest;
  perform 1 from public.spaces where id = home and state = 'waiting' and owner_id <> actor for update;
  if not found then return false; end if;
  update private.invitations set requester_id = actor
    where space_id = home and code_hash = digest and expires_at > now()
      and (requester_id is null or requester_id = actor);
  return found;
end;
$$;
