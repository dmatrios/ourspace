create table private.member_avatar_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  silhouette text not null default 'neutral' check (silhouette in ('masculine', 'feminine', 'neutral')),
  hair_style text not null default 'short' check (hair_style in ('short', 'long', 'curly')),
  hair_color text not null default 'brown' check (hair_color in ('brown', 'black', 'blonde')),
  outfit text not null default 'sage' check (outfit in ('sage', 'plum', 'ocean', 'coral')),
  updated_at timestamptz not null default now()
);

create table private.member_avatar_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_days integer not null default 1 check (active_days > 0),
  last_active_on date not null default (timezone('America/Lima', now())::date)
);

revoke all on private.member_avatar_preferences, private.member_avatar_activity from public, anon, authenticated;

create function public.get_member_avatar() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  today date := timezone('America/Lima', now())::date;
  active_days_value integer;
  completed_tasks integer;
  avatar private.member_avatar_preferences%rowtype;
  hairstyles jsonb;
  outfits jsonb;
begin
  if actor is null then raise exception 'Authentication required'; end if;

  insert into private.member_avatar_activity(user_id, active_days, last_active_on)
    values (actor, 1, today)
    on conflict (user_id) do update set
      active_days = member_avatar_activity.active_days +
        case when member_avatar_activity.last_active_on < today then 1 else 0 end,
      last_active_on = greatest(member_avatar_activity.last_active_on, today)
    returning active_days into active_days_value;

  select count(*)::integer into completed_tasks from public.tasks t
  where t.completed and (
    t.owner_id = actor or exists (
      select from public.memberships m where m.user_id = actor and m.space_id = t.space_id
    )
  );

  insert into private.member_avatar_preferences(user_id) values (actor)
    on conflict (user_id) do nothing;
  select * into avatar from private.member_avatar_preferences where user_id = actor;

  hairstyles := jsonb_build_array('short');
  if completed_tasks >= 3 then hairstyles := hairstyles || jsonb_build_array('long'); end if;
  if active_days_value >= 7 then hairstyles := hairstyles || jsonb_build_array('curly'); end if;

  outfits := jsonb_build_array('sage');
  if active_days_value >= 3 then outfits := outfits || jsonb_build_array('plum'); end if;
  if completed_tasks >= 5 then outfits := outfits || jsonb_build_array('ocean'); end if;
  if active_days_value >= 14 then outfits := outfits || jsonb_build_array('coral'); end if;

  return jsonb_build_object(
    'appearance', jsonb_build_object(
      'silhouette', avatar.silhouette,
      'hair_style', avatar.hair_style,
      'hair_color', avatar.hair_color,
      'outfit', avatar.outfit
    ),
    'progress', jsonb_build_object(
      'active_days', active_days_value,
      'completed_tasks', completed_tasks,
      'unlocked_hair_styles', hairstyles,
      'unlocked_outfits', outfits
    )
  );
end;
$$;

create function public.save_member_avatar(
  chosen_silhouette text, chosen_hair_style text, chosen_hair_color text, chosen_outfit text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  today date := timezone('America/Lima', now())::date;
  active_days_value integer;
  completed_tasks integer;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if chosen_silhouette is null or chosen_silhouette not in ('masculine', 'feminine', 'neutral')
    or chosen_hair_style is null or chosen_hair_style not in ('short', 'long', 'curly')
    or chosen_hair_color is null or chosen_hair_color not in ('brown', 'black', 'blonde')
    or chosen_outfit is null or chosen_outfit not in ('sage', 'plum', 'ocean', 'coral') then
    return 'invalid';
  end if;

  insert into private.member_avatar_activity(user_id, active_days, last_active_on)
    values (actor, 1, today)
    on conflict (user_id) do update set
      active_days = member_avatar_activity.active_days +
        case when member_avatar_activity.last_active_on < today then 1 else 0 end,
      last_active_on = greatest(member_avatar_activity.last_active_on, today)
    returning active_days into active_days_value;

  select count(*)::integer into completed_tasks from public.tasks t
  where t.completed and (
    t.owner_id = actor or exists (
      select from public.memberships m where m.user_id = actor and m.space_id = t.space_id
    )
  );

  if (chosen_hair_style = 'long' and completed_tasks < 3)
    or (chosen_hair_style = 'curly' and active_days_value < 7)
    or (chosen_outfit = 'plum' and active_days_value < 3)
    or (chosen_outfit = 'ocean' and completed_tasks < 5)
    or (chosen_outfit = 'coral' and active_days_value < 14) then
    return 'locked';
  end if;

  insert into private.member_avatar_preferences(user_id, silhouette, hair_style, hair_color, outfit, updated_at)
    values (actor, chosen_silhouette, chosen_hair_style, chosen_hair_color, chosen_outfit, now())
    on conflict (user_id) do update set
      silhouette = excluded.silhouette,
      hair_style = excluded.hair_style,
      hair_color = excluded.hair_color,
      outfit = excluded.outfit,
      updated_at = excluded.updated_at;
  return 'saved';
end;
$$;

revoke execute on function public.get_member_avatar(),
  public.save_member_avatar(text, text, text, text) from public, anon;
grant execute on function public.get_member_avatar(),
  public.save_member_avatar(text, text, text, text) to authenticated;
