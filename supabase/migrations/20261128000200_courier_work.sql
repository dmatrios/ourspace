create table public.courier_platforms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  active boolean not null default true,
  cash_limit numeric(14,2) check (cash_limit >= 0),
  unique (user_id, id)
);
create unique index courier_platform_name_unique on public.courier_platforms(user_id, lower(trim(name)));

create table public.courier_vehicles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  odometer_km numeric(12,1) check (odometer_km >= 0)
);

create table public.courier_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  odometer_start numeric(12,1) check (odometer_start >= 0),
  odometer_end numeric(12,1),
  opening_cash numeric(14,2) not null default 0 check (opening_cash >= 0),
  cash_counted numeric(14,2) check (cash_counted >= 0),
  cash_counted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, platform_id) references public.courier_platforms(user_id, id) on delete restrict,
  check ((status in ('active', 'paused') and ended_at is null) or
    (status = 'completed' and ended_at is not null and ended_at >= started_at)),
  check (odometer_end is null or odometer_start is null or odometer_end >= odometer_start)
);
create unique index courier_one_open_shift on public.courier_shifts(user_id) where status in ('active', 'paused');
create index courier_shifts_recent on public.courier_shifts(user_id, started_at desc);

create table public.courier_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shift_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  odometer_pause numeric(12,1) check (odometer_pause >= 0),
  odometer_resume numeric(12,1) check (odometer_resume is null or (odometer_pause is not null and odometer_resume >= odometer_pause)),
  unique (user_id, id),
  foreign key (user_id, shift_id) references public.courier_shifts(user_id, id) on delete cascade,
  check (ended_at is null or ended_at >= started_at)
);
create unique index courier_one_open_pause on public.courier_pauses(shift_id) where ended_at is null;

create table public.courier_earnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_id uuid not null,
  shift_id uuid,
  earned_on date not null,
  mode text not null check (mode in ('daily', 'shift')),
  reported_amount numeric(14,2) not null check (reported_amount >= 0),
  tips numeric(14,2) not null default 0 check (tips >= 0),
  bonuses numeric(14,2) not null default 0 check (bonuses >= 0),
  tips_included boolean not null default false,
  bonuses_included boolean not null default false,
  orders integer not null default 0 check (orders >= 0),
  notes text not null default '',
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, platform_id) references public.courier_platforms(user_id, id) on delete restrict,
  foreign key (user_id, shift_id) references public.courier_shifts(user_id, id) on delete restrict,
  check ((mode = 'daily' and shift_id is null) or (mode = 'shift' and shift_id is not null))
);
create unique index courier_one_daily_earning on public.courier_earnings(user_id, platform_id, earned_on) where mode = 'daily';
create unique index courier_one_shift_earning on public.courier_earnings(user_id, shift_id) where mode = 'shift';

create function public.courier_validate_earning() returns trigger
language plpgsql security definer set search_path = '' as $$
declare shift_record public.courier_shifts;
begin
  if new.mode = 'shift' then
    select * into shift_record from public.courier_shifts where id = new.shift_id and user_id = new.user_id;
    if shift_record.id is null or shift_record.platform_id <> new.platform_id then
      raise exception 'Shift and platform do not match';
    end if;
    new.earned_on := timezone('America/Lima', shift_record.started_at)::date;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || new.platform_id::text || new.earned_on::text, 0));
  if exists (select from public.courier_earnings e where e.user_id = new.user_id and e.platform_id = new.platform_id
    and e.earned_on = new.earned_on and e.mode <> new.mode and e.id <> new.id) then
    raise exception 'Daily and shift earnings cannot overlap for the same platform and date';
  end if;
  return new;
end;
$$;
create trigger courier_earning_guard before insert or update on public.courier_earnings
for each row execute function public.courier_validate_earning();

create table public.courier_earnings_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  earning_id uuid not null,
  before_value jsonb not null,
  after_value jsonb not null,
  changed_at timestamptz not null default now(),
  foreign key (user_id, earning_id) references public.courier_earnings(user_id, id) on delete cascade
);
create function public.courier_record_earning_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.revision <> old.revision + 1 then
    raise exception 'Earning revision must advance by one';
  end if;
  new.updated_at := now();
  insert into public.courier_earnings_history(user_id, earning_id, before_value, after_value)
    values (old.user_id, old.id, to_jsonb(old), to_jsonb(new));
  return new;
end;
$$;
create trigger courier_earning_audit before update on public.courier_earnings
for each row execute function public.courier_record_earning_change();

create table public.courier_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  kind text not null check (kind in ('operational', 'personal')),
  active boolean not null default true,
  unique (user_id, id)
);
create unique index courier_category_name_unique on public.courier_categories(user_id, kind, lower(trim(name)));

create function public.courier_seed_categories() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.enabled and (tg_op = 'INSERT' or not old.enabled) then
    insert into public.courier_platforms(user_id, name) values (new.user_id, 'PedidosYa') on conflict do nothing;
    insert into public.courier_categories(user_id, name, kind) values
      (new.user_id, 'Comida de trabajo', 'operational'),
      (new.user_id, 'Mantenimiento', 'operational'),
      (new.user_id, 'Peajes', 'operational'),
      (new.user_id, 'Otros del trabajo', 'operational'),
      (new.user_id, 'Personal', 'personal')
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger courier_default_categories after insert or update of enabled on public.courier_accounts
for each row execute function public.courier_seed_categories();
insert into public.courier_platforms(user_id, name)
select user_id, 'PedidosYa' from public.courier_accounts where enabled on conflict do nothing;
insert into public.courier_categories(user_id, name, kind)
select user_id, name, kind from public.courier_accounts c
cross join (values ('Comida de trabajo', 'operational'), ('Mantenimiento', 'operational'),
  ('Peajes', 'operational'), ('Otros del trabajo', 'operational'), ('Personal', 'personal')) as defaults(name, kind)
where c.enabled on conflict do nothing;

create table public.courier_recurring (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  description text not null check (char_length(trim(description)) between 1 and 200),
  amount numeric(14,2) not null check (amount > 0),
  cadence text not null check (cadence in ('weekly', 'monthly')),
  anchor_date date not null,
  active boolean not null default true,
  unique (user_id, id),
  foreign key (user_id, category_id) references public.courier_categories(user_id, id) on delete restrict
);

create table public.courier_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  shift_id uuid,
  recurring_id uuid,
  due_date date,
  occurred_at timestamptz not null default now(),
  amount numeric(14,2) not null check (amount > 0),
  description text not null check (char_length(trim(description)) between 1 and 200),
  notes text not null default '',
  ruc text,
  payment_method text check (payment_method in ('cash', 'yape', 'plin', 'card')),
  cash_paid numeric(14,2),
  unique (user_id, id),
  foreign key (user_id, category_id) references public.courier_categories(user_id, id) on delete restrict,
  foreign key (user_id, shift_id) references public.courier_shifts(user_id, id) on delete set null (shift_id),
  foreign key (user_id, recurring_id) references public.courier_recurring(user_id, id) on delete set null (recurring_id),
  check ((recurring_id is null and due_date is null) or (recurring_id is not null and due_date is not null)),
  check (cash_paid is null or (payment_method = 'cash' and cash_paid >= amount))
);
create unique index courier_one_recurring_payment on public.courier_expenses(user_id, recurring_id, due_date)
where recurring_id is not null;

create table public.courier_fuel (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shift_id uuid,
  occurred_at timestamptz not null default now(),
  amount numeric(14,2) not null check (amount > 0),
  liters numeric(10,3) check (liters > 0),
  odometer_km numeric(12,1) check (odometer_km >= 0),
  full_tank boolean not null default false,
  notes text not null default '',
  payment_method text check (payment_method in ('cash', 'yape', 'plin', 'card')),
  cash_paid numeric(14,2),
  unique (user_id, id),
  foreign key (user_id, shift_id) references public.courier_shifts(user_id, id) on delete set null (shift_id),
  check (cash_paid is null or (payment_method = 'cash' and cash_paid >= amount))
);

create table public.courier_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform_id uuid not null,
  shift_id uuid,
  occurred_at timestamptz not null default now(),
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'yape', 'plin', 'card')),
  cash_received numeric(14,2),
  description text not null default '',
  unique (user_id, id),
  foreign key (user_id, platform_id) references public.courier_platforms(user_id, id) on delete restrict,
  foreign key (user_id, shift_id) references public.courier_shifts(user_id, id) on delete set null (shift_id),
  check (cash_received is null or (payment_method = 'cash' and cash_received >= amount))
);

create function public.courier_check_receipt_shift() returns trigger
language plpgsql security definer set search_path = '' as $$
declare linked_shift public.courier_shifts;
begin
  if new.shift_id is not null then
    select * into linked_shift from public.courier_shifts where id = new.shift_id and user_id = new.user_id;
    if linked_shift.id is null or linked_shift.platform_id <> new.platform_id then
      raise exception 'Receipt shift and platform do not match';
    end if;
    if new.occurred_at < linked_shift.started_at or new.occurred_at > coalesce(linked_shift.ended_at, now()) then
      raise exception 'Receipt is outside shift time';
    end if;
  end if;
  return new;
end;
$$;
create trigger courier_receipt_shift_guard before insert or update of shift_id, platform_id, occurred_at on public.courier_receipts
for each row execute function public.courier_check_receipt_shift();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'courier_platforms', 'courier_vehicles', 'courier_shifts', 'courier_pauses',
    'courier_earnings', 'courier_earnings_history', 'courier_categories',
    'courier_recurring', 'courier_expenses', 'courier_fuel', 'courier_receipts'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      table_name || '_read_own', table_name);
    if table_name not in ('courier_shifts', 'courier_pauses', 'courier_earnings_history') then
      execute format('grant insert, update, delete on public.%I to authenticated', table_name);
      execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
        table_name || '_write_own', table_name);
    end if;
  end loop;
end;
$$;

create function public.courier_start_shift(p_platform_id uuid, p_odometer numeric default null, p_opening_cash numeric default 0)
returns public.courier_shifts language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result public.courier_shifts;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not exists (select from public.courier_accounts where user_id = actor and enabled) then raise exception 'Courier role required'; end if;
  if p_opening_cash < 0 or p_odometer < 0 then raise exception 'Invalid opening values'; end if;
  insert into public.courier_shifts(user_id, platform_id, odometer_start, opening_cash)
    select actor, p_platform_id, p_odometer, p_opening_cash from public.courier_platforms
    where id = p_platform_id and user_id = actor and active
    returning * into result;
  if result.id is null then raise exception 'Platform unavailable'; end if;
  return result;
end;
$$;

create function public.courier_transition_shift(p_shift_id uuid, p_action text, p_odometer numeric default null)
returns public.courier_shifts language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result public.courier_shifts; event_at timestamptz := clock_timestamp();
  previous_reading numeric(12,1); open_pause public.courier_pauses; final_reading numeric(12,1);
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into result from public.courier_shifts where id = p_shift_id and user_id = actor for update;
  if result.id is null then raise exception 'Shift unavailable'; end if;
  if (p_action = 'pause' and result.status = 'paused') or (p_action = 'resume' and result.status = 'active')
    or (p_action = 'finish' and result.status = 'completed') then return result; end if;
  if result.odometer_start is null and p_odometer is not null then raise exception 'Starting odometer required'; end if;
  select coalesce(odometer_resume, odometer_pause) into previous_reading
    from public.courier_pauses where shift_id = p_shift_id order by started_at desc limit 1;
  previous_reading := coalesce(previous_reading, result.odometer_start);
  if p_action = 'pause' and result.status = 'active' then
    if result.odometer_start is not null and p_odometer is null then raise exception 'Odometer required before pausing'; end if;
    if p_odometer is not null and p_odometer < previous_reading then raise exception 'Odometer cannot decrease'; end if;
    insert into public.courier_pauses(user_id, shift_id, started_at, odometer_pause)
      values (actor, p_shift_id, event_at, p_odometer);
    update public.courier_shifts set status = 'paused', updated_at = event_at where id = p_shift_id returning * into result;
  elsif p_action = 'resume' and result.status = 'paused' then
    select * into open_pause from public.courier_pauses where shift_id = p_shift_id and user_id = actor and ended_at is null for update;
    if open_pause.id is null then raise exception 'Open pause unavailable'; end if;
    if result.odometer_start is not null and p_odometer is null then raise exception 'Odometer required before resuming'; end if;
    if p_odometer is not null and p_odometer < coalesce(open_pause.odometer_pause, previous_reading) then
      raise exception 'Odometer cannot decrease'; end if;
    update public.courier_pauses set ended_at = event_at, odometer_resume = p_odometer where id = open_pause.id;
    update public.courier_shifts set status = 'active', updated_at = event_at where id = p_shift_id returning * into result;
  elsif p_action = 'finish' and result.status in ('active', 'paused') then
    final_reading := p_odometer;
    if result.status = 'paused' then
      select * into open_pause from public.courier_pauses where shift_id = p_shift_id and user_id = actor and ended_at is null for update;
      final_reading := coalesce(final_reading, open_pause.odometer_pause);
    end if;
    if result.odometer_start is not null and final_reading is null then raise exception 'Ending odometer required'; end if;
    if final_reading is not null and final_reading < previous_reading then raise exception 'Odometer cannot decrease'; end if;
    update public.courier_pauses set ended_at = event_at where shift_id = p_shift_id and user_id = actor and ended_at is null;
    update public.courier_shifts set status = 'completed', ended_at = event_at,
      odometer_end = final_reading, updated_at = event_at where id = p_shift_id returning * into result;
  else
    raise exception 'Invalid shift transition';
  end if;
  return result;
end;
$$;

create function public.courier_correct_shift_time(p_shift_id uuid, p_started_at timestamptz, p_ended_at timestamptz)
returns public.courier_shifts language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result public.courier_shifts;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into result from public.courier_shifts where id = p_shift_id and user_id = actor for update;
  if result.id is null or result.status <> 'completed' or p_started_at is null or p_ended_at is null
    or p_started_at > p_ended_at or p_ended_at > now() then raise exception 'Invalid shift correction'; end if;
  if exists (select from public.courier_pauses where shift_id = p_shift_id and
    (started_at < p_started_at or ended_at > p_ended_at)) then raise exception 'Pause outside corrected shift'; end if;
  if exists (select from public.courier_receipts where shift_id = p_shift_id and
    (occurred_at < p_started_at or occurred_at > p_ended_at)) then raise exception 'Receipt outside corrected shift'; end if;
  update public.courier_shifts set started_at = p_started_at, ended_at = p_ended_at, updated_at = now()
    where id = p_shift_id returning * into result;
  return result;
end;
$$;

create function public.courier_count_cash(p_shift_id uuid, p_counted numeric)
returns public.courier_shifts language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result public.courier_shifts;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Invalid cash count'; end if;
  update public.courier_shifts set cash_counted = p_counted, cash_counted_at = now(), updated_at = now()
    where id = p_shift_id and user_id = actor and status = 'completed' returning * into result;
  if result.id is null then raise exception 'Completed shift unavailable'; end if;
  return result;
end;
$$;

revoke execute on function public.courier_start_shift(uuid,numeric,numeric),
  public.courier_transition_shift(uuid,text,numeric),
  public.courier_correct_shift_time(uuid,timestamptz,timestamptz),
  public.courier_count_cash(uuid,numeric) from public, anon;
grant execute on function public.courier_start_shift(uuid,numeric,numeric),
  public.courier_transition_shift(uuid,text,numeric),
  public.courier_correct_shift_time(uuid,timestamptz,timestamptz),
  public.courier_count_cash(uuid,numeric) to authenticated;

create function public.courier_remove_category(p_category_id uuid, p_replacement_id uuid default null)
returns text language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); source_kind text;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select kind into source_kind from public.courier_categories
    where id = p_category_id and user_id = actor for update;
  if source_kind is null then return 'unavailable'; end if;
  if p_replacement_id is null then
    if exists (select from public.courier_expenses where user_id = actor and category_id = p_category_id)
      or exists (select from public.courier_recurring where user_id = actor and category_id = p_category_id) then
      return 'in_use';
    end if;
  else
    if p_replacement_id = p_category_id or not exists (
      select from public.courier_categories where id = p_replacement_id and user_id = actor and kind = source_kind
    ) then return 'invalid_replacement'; end if;
    update public.courier_expenses set category_id = p_replacement_id where user_id = actor and category_id = p_category_id;
    update public.courier_recurring set category_id = p_replacement_id where user_id = actor and category_id = p_category_id;
  end if;
  delete from public.courier_categories where id = p_category_id and user_id = actor;
  return 'deleted';
end;
$$;
revoke execute on function public.courier_remove_category(uuid,uuid) from public, anon;
grant execute on function public.courier_remove_category(uuid,uuid) to authenticated;
