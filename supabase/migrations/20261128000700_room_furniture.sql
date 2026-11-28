create table private.room_layouts (
  space_id uuid primary key references public.spaces(id) on delete cascade,
  items jsonb not null default '[{"id":"sofa","kind":"sofa","x":1,"z":5},{"id":"desk","kind":"desk","x":6,"z":1},{"id":"plant","kind":"plant","x":0,"z":1}]'::jsonb,
  unlocked_kinds text[] not null default array['sofa','desk','plant'],
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
revoke all on private.room_layouts from public, anon, authenticated;

create function private.room_progress(home uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'completed_tasks', (select count(*)::integer from public.tasks where space_id = home and completed),
    'active_days', coalesce((select max(a.active_days) from private.member_avatar_activity a
      join public.memberships m on m.user_id = a.user_id where m.space_id = home), 0)
  );
$$;

create function private.refresh_room_unlocks(home uuid, progress jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare earned text[] := array[]::text[];
begin
  if (progress->>'completed_tasks')::integer >= 2 then earned := array_append(earned, 'chair'); end if;
  if (progress->>'completed_tasks')::integer >= 5 then earned := array_append(earned, 'lamp'); end if;
  if (progress->>'active_days')::integer >= 7 then earned := array_append(earned, 'bookshelf'); end if;
  if (progress->>'active_days')::integer >= 14 or (progress->>'completed_tasks')::integer >= 8 then
    earned := array_append(earned, 'flowers');
  end if;
  update private.room_layouts set unlocked_kinds = array(
    select distinct unnest(unlocked_kinds || earned) order by 1
  ) where space_id = home and not unlocked_kinds @> earned;
end;
$$;

create function public.get_room_layout(space_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result jsonb; progress jsonb;
begin
  if actor is null or not exists (
    select from public.spaces s join public.memberships m on m.space_id = s.id
    where s.id = space_key and s.state in ('paired','retained') and m.user_id = actor
  ) then return null; end if;
  insert into private.room_layouts(space_id) values (space_key) on conflict do nothing;
  progress := private.room_progress(space_key);
  perform private.refresh_room_unlocks(space_key, progress);
  select jsonb_build_object('items', items, 'revision', revision,
    'unlocked_kinds', unlocked_kinds, 'progress', progress) into result
    from private.room_layouts where space_id = space_key;
  return result;
end;
$$;

create function public.save_room_layout(space_key uuid, expected_revision integer, chosen_items jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); layout private.room_layouts; item jsonb; counts jsonb := '{}'::jsonb;
  kind text; progress jsonb; seen text[] := array[]::text[]; x numeric; z numeric;
begin
  if actor is null or not exists (
    select from public.spaces s join public.memberships m on m.space_id = s.id
    where s.id = space_key and s.state in ('paired','retained') and m.user_id = actor
  ) then return 'unavailable'; end if;
  if expected_revision is null or expected_revision < 0 or jsonb_typeof(chosen_items) is distinct from 'array' then
    return 'invalid'; end if;
  if jsonb_array_length(chosen_items) > 12 then return 'invalid'; end if;

  insert into private.room_layouts(space_id) values (space_key) on conflict do nothing;
  select * into layout from private.room_layouts where space_id = space_key for update;
  if layout.revision <> expected_revision then return 'conflict'; end if;
  progress := private.room_progress(space_key);
  perform private.refresh_room_unlocks(space_key, progress);
  select * into layout from private.room_layouts where space_id = space_key;

  for item in select value from jsonb_array_elements(chosen_items) loop
    kind := item->>'kind';
    if jsonb_typeof(item) <> 'object' or coalesce(item->>'id','') !~ '^[a-z0-9-]{1,40}$'
      or item->>'id' = any(seen) or coalesce(kind,'') not in ('sofa','desk','plant','chair','lamp','bookshelf','flowers')
      or jsonb_typeof(item->'x') is distinct from 'number'
      or jsonb_typeof(item->'z') is distinct from 'number'
    then return 'invalid'; end if;
    if kind <> all(layout.unlocked_kinds) then return 'locked'; end if;
    x := (item->>'x')::numeric; z := (item->>'z')::numeric;
    if x <> trunc(x) or z <> trunc(z) or x < 0 or x > 8 or z < 0 or z > 6 then return 'invalid'; end if;
    seen := array_append(seen, item->>'id');
    counts := jsonb_set(counts, array[kind], to_jsonb(coalesce((counts->>kind)::integer, 0) + 1));
    if (kind in ('chair','plant','flowers') and (counts->>kind)::integer > 3)
      or (kind not in ('chair','plant','flowers') and (counts->>kind)::integer > 1) then
      return 'invalid'; end if;
  end loop;

  update private.room_layouts set items = chosen_items, revision = revision + 1, updated_at = now()
    where space_id = space_key and revision = expected_revision;
  return case when found then 'saved' else 'conflict' end;
end;
$$;

revoke execute on function public.get_room_layout(uuid), public.save_room_layout(uuid,integer,jsonb)
  from public, anon;
grant execute on function public.get_room_layout(uuid), public.save_room_layout(uuid,integer,jsonb)
  to authenticated;
