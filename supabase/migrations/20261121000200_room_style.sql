create table public.room_styles (
  space_id uuid primary key references public.spaces on delete cascade,
  palette text not null check (palette in ('forest', 'sunset', 'night')),
  revision integer not null check (revision > 0)
);

alter table public.room_styles enable row level security;
revoke all on public.room_styles from public, anon, authenticated;
grant select on public.room_styles to authenticated;

create policy member_room_style on public.room_styles for select to authenticated
using (exists (select from public.spaces where id = room_styles.space_id));

create function public.save_room_style(palette_name text, expected_revision integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  home uuid;
begin
  if palette_name is null or palette_name not in ('forest', 'sunset', 'night') or
    expected_revision is null or expected_revision < 0 then return false; end if;

  select s.id into home from public.spaces s
    join public.memberships m on m.space_id = s.id
    where m.user_id = auth.uid() and s.state in ('paired', 'retained')
    for update of s;
  if home is null then return false; end if;

  if expected_revision = 0 then
    insert into public.room_styles values (home, palette_name, 1)
      on conflict (space_id) do nothing;
  else
    update public.room_styles set palette = palette_name, revision = revision + 1
      where space_id = home and revision = expected_revision;
  end if;
  return found;
end;
$$;

revoke execute on function public.save_room_style(text, integer) from public, anon;
grant execute on function public.save_room_style(text, integer) to authenticated;

create or replace function public.export_separated_space() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'format', 2, 'space_id', s.id,
    'room', jsonb_build_object('palette', coalesce(r.palette, 'forest')),
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
