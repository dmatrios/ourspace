create table public.courier_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  display_name text check (display_name is null or char_length(trim(display_name)) between 1 and 80),
  currency text not null default 'PEN' check (currency = 'PEN'),
  time_zone text not null default 'America/Lima' check (time_zone = 'America/Lima'),
  earning_mode text not null default 'daily' check (earning_mode in ('daily', 'shift')),
  weekly_goal numeric(14,2) check (weekly_goal > 0),
  updated_at timestamptz not null default now()
);
alter table public.courier_accounts enable row level security;
revoke all on public.courier_accounts from public, anon, authenticated;
grant select, insert (user_id, enabled, display_name, earning_mode, weekly_goal),
  update (enabled, display_name, earning_mode, weekly_goal) on public.courier_accounts to authenticated;
create policy courier_account_owner on public.courier_accounts for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table private.member_avatar_preferences drop constraint member_avatar_preferences_outfit_check;
alter table private.member_avatar_preferences add constraint member_avatar_preferences_outfit_check
  check (outfit in ('sage', 'plum', 'ocean', 'coral', 'courier_red'));

create function public.reset_courier_outfit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.enabled then
    update private.member_avatar_preferences set outfit = 'sage', updated_at = now()
    where user_id = new.user_id and outfit = 'courier_red';
  end if;
  return new;
end;
$$;
create trigger courier_role_outfit_reset after update of enabled on public.courier_accounts
for each row execute function public.reset_courier_outfit();

create or replace function public.get_member_avatar() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  today date := timezone('America/Lima', now())::date;
  active_days_value integer;
  completed_tasks integer;
  avatar private.member_avatar_preferences%rowtype;
  hairstyles jsonb;
  outfits jsonb;
  courier_enabled boolean;
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
  where t.completed and (t.owner_id = actor or exists (
    select from public.memberships m where m.user_id = actor and m.space_id = t.space_id
  ));
  insert into private.member_avatar_preferences(user_id) values (actor)
    on conflict (user_id) do nothing;
  select * into avatar from private.member_avatar_preferences where user_id = actor;
  select coalesce(c.enabled, false) into courier_enabled
  from public.courier_accounts c where c.user_id = actor;
  courier_enabled := coalesce(courier_enabled, false);
  hairstyles := jsonb_build_array('short');
  if completed_tasks >= 3 then hairstyles := hairstyles || jsonb_build_array('long'); end if;
  if active_days_value >= 7 then hairstyles := hairstyles || jsonb_build_array('curly'); end if;
  outfits := jsonb_build_array('sage');
  if active_days_value >= 3 then outfits := outfits || jsonb_build_array('plum'); end if;
  if completed_tasks >= 5 then outfits := outfits || jsonb_build_array('ocean'); end if;
  if active_days_value >= 14 then outfits := outfits || jsonb_build_array('coral'); end if;
  if courier_enabled then outfits := outfits || jsonb_build_array('courier_red'); end if;
  return jsonb_build_object(
    'appearance', jsonb_build_object(
      'silhouette', avatar.silhouette, 'hair_style', avatar.hair_style,
      'hair_color', avatar.hair_color, 'outfit', avatar.outfit
    ),
    'progress', jsonb_build_object(
      'active_days', active_days_value, 'completed_tasks', completed_tasks,
      'unlocked_hair_styles', hairstyles, 'unlocked_outfits', outfits,
      'courier_enabled', courier_enabled
    )
  );
end;
$$;

create or replace function public.save_member_avatar(
  chosen_silhouette text, chosen_hair_style text, chosen_hair_color text, chosen_outfit text
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  today date := timezone('America/Lima', now())::date;
  active_days_value integer;
  completed_tasks integer;
  courier_enabled boolean;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if chosen_silhouette is null or chosen_silhouette not in ('masculine', 'feminine', 'neutral')
    or chosen_hair_style is null or chosen_hair_style not in ('short', 'long', 'curly')
    or chosen_hair_color is null or chosen_hair_color not in ('brown', 'black', 'blonde')
    or chosen_outfit is null or chosen_outfit not in ('sage', 'plum', 'ocean', 'coral', 'courier_red') then
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
  where t.completed and (t.owner_id = actor or exists (
    select from public.memberships m where m.user_id = actor and m.space_id = t.space_id
  ));
  select coalesce(c.enabled, false) into courier_enabled
  from public.courier_accounts c where c.user_id = actor;
  courier_enabled := coalesce(courier_enabled, false);
  if (chosen_hair_style = 'long' and completed_tasks < 3)
    or (chosen_hair_style = 'curly' and active_days_value < 7)
    or (chosen_outfit = 'plum' and active_days_value < 3)
    or (chosen_outfit = 'ocean' and completed_tasks < 5)
    or (chosen_outfit = 'coral' and active_days_value < 14)
    or (chosen_outfit = 'courier_red' and not courier_enabled) then
    return 'locked';
  end if;
  insert into private.member_avatar_preferences(user_id, silhouette, hair_style, hair_color, outfit, updated_at)
    values (actor, chosen_silhouette, chosen_hair_style, chosen_hair_color, chosen_outfit, now())
    on conflict (user_id) do update set
      silhouette = excluded.silhouette, hair_style = excluded.hair_style,
      hair_color = excluded.hair_color, outfit = excluded.outfit, updated_at = excluded.updated_at;
  return 'saved';
end;
$$;
