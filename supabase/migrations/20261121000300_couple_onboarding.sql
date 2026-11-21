alter table public.spaces add column relationship_since date;

create table private.couple_introductions (
  space_id uuid not null references public.spaces on delete cascade,
  author_id uuid not null,
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  interests text not null check (char_length(interests) <= 400),
  short_goals text not null check (char_length(short_goals) <= 600),
  long_goals text not null check (char_length(long_goals) <= 600),
  revision integer not null check (revision > 0),
  primary key (space_id, author_id)
);

create function public.get_couple_onboarding(space_key uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'relationship_since', s.relationship_since,
    'introductions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'is_mine', i.author_id = auth.uid(),
          'display_name', i.display_name,
          'interests', i.interests,
          'short_goals', i.short_goals,
          'long_goals', i.long_goals,
          'revision', i.revision
        ) order by (i.author_id = auth.uid()) desc, i.author_id
      )
      from private.couple_introductions i where i.space_id = s.id
    ), '[]'::jsonb)
  )
  from public.spaces s
  join public.memberships m on m.space_id = s.id
  where s.id = space_key and m.user_id = auth.uid() and s.state <> 'waiting';
$$;

create function public.save_couple_onboarding(
  space_key uuid, preferred_name text, likes text, short_term text, long_term text,
  started_on date, previous_started_on date, expected_revision integer
) returns text language plpgsql security definer set search_path = '' as $$
declare
  home uuid;
  actor uuid := auth.uid();
  current_date_value date;
begin
  if preferred_name is null or char_length(trim(preferred_name)) not between 1 and 60
    or char_length(coalesce(likes, '')) > 400 or char_length(coalesce(short_term, '')) > 600
    or char_length(coalesce(long_term, '')) > 600
    or expected_revision is null or expected_revision < 0
    or (started_on is not null and not (
      started_on between date '1900-01-01' and timezone('America/Lima', now())::date
    )) then
    return 'invalid';
  end if;

  select s.id, s.relationship_since into home, current_date_value
  from public.spaces s
  where s.id = space_key and s.state in ('paired', 'retained')
    and exists (select from public.memberships m where m.space_id = s.id and m.user_id = actor)
  for update;
  if home is null or not exists (
    select from public.memberships m where m.space_id = home and m.user_id = actor
  ) then return 'unavailable'; end if;

  if started_on is distinct from previous_started_on
    and current_date_value is distinct from previous_started_on
    and current_date_value is distinct from started_on then
    return 'date_conflict';
  end if;

  if expected_revision = 0 then
    insert into private.couple_introductions values (
      home, actor, trim(preferred_name), trim(coalesce(likes, '')),
      trim(coalesce(short_term, '')), trim(coalesce(long_term, '')), 1
    ) on conflict (space_id, author_id) do nothing;
  else
    update private.couple_introductions set
      display_name = trim(preferred_name), interests = trim(coalesce(likes, '')),
      short_goals = trim(coalesce(short_term, '')), long_goals = trim(coalesce(long_term, '')),
      revision = revision + 1
    where space_id = home and author_id = actor and revision = expected_revision;
  end if;
  if not found then return 'profile_conflict'; end if;

  if started_on is distinct from previous_started_on then
    update public.spaces set relationship_since = started_on where id = home;
  end if;
  return 'saved';
end;
$$;

revoke execute on function public.get_couple_onboarding(uuid),
  public.save_couple_onboarding(uuid, text, text, text, text, date, date, integer) from public, anon;
grant execute on function public.get_couple_onboarding(uuid),
  public.save_couple_onboarding(uuid, text, text, text, text, date, date, integer) to authenticated;

create or replace function public.export_separated_space() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'format', 3, 'space_id', s.id,
    'room', jsonb_build_object('palette', coalesce(r.palette, 'forest')),
    'onboarding', jsonb_build_object(
      'relationship_since', s.relationship_since,
      'introductions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'display_name', i.display_name, 'interests', i.interests,
          'short_goals', i.short_goals, 'long_goals', i.long_goals
        ) order by i.author_id)
        from private.couple_introductions i where i.space_id = s.id
      ), '[]'::jsonb)
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'completed', t.completed, 'created_at', t.created_at
      ) order by t.created_at)
      from public.tasks t where t.space_id = s.id
    ), '[]'::jsonb)
  )
  from public.spaces s left join public.room_styles r on r.space_id = s.id
  where s.owner_id = auth.uid() and s.state = 'separated';
$$;
