alter table public.courier_accounts
  add column allow_partner_logging boolean not null default false;
grant update (allow_partner_logging) on public.courier_accounts to authenticated;

alter table public.courier_receipts
  add column entered_by uuid references auth.users(id) on delete set null;
alter table public.courier_expenses
  add column entered_by uuid references auth.users(id) on delete set null;

create function public.courier_stamp_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.entered_by := auth.uid();
  else
    new.entered_by := old.entered_by;
  end if;
  return new;
end;
$$;
create trigger courier_receipt_entry before insert or update on public.courier_receipts
for each row execute function public.courier_stamp_entry();
create trigger courier_expense_entry before insert or update on public.courier_expenses
for each row execute function public.courier_stamp_entry();

create function private.courier_partner_target() returns uuid
language sql stable security definer set search_path = '' as $$
  select case when s.owner_id = auth.uid() then m.user_id else s.owner_id end
  from public.spaces s
  join public.memberships m on m.space_id = s.id
  join public.courier_accounts c on c.user_id = case when s.owner_id = auth.uid() then m.user_id else s.owner_id end
  where s.state = 'paired' and (s.owner_id = auth.uid() or m.user_id = auth.uid())
    and c.enabled and c.allow_partner_logging
  limit 1;
$$;

create function public.courier_partner_context() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare target uuid := private.courier_partner_target(); result jsonb;
begin
  if target is null then return null; end if;
  select jsonb_build_object(
    'user_id', target,
    'name', coalesce(c.display_name, 'Tu pareja'),
    'shift', (select jsonb_build_object('id', s.id, 'platform_id', s.platform_id, 'status', s.status)
      from public.courier_shifts s where s.user_id = target and s.status in ('active', 'paused') limit 1),
    'platforms', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name), '[]'::jsonb)
      from public.courier_platforms p where p.user_id = target and p.active),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', cat.id, 'name', cat.name) order by cat.name), '[]'::jsonb)
      from public.courier_categories cat where cat.user_id = target and cat.active and cat.kind = 'operational'),
    'recent', (select coalesce(jsonb_agg(entry order by entry.occurred_at desc), '[]'::jsonb) from (
      select 'receipt' as kind, r.description, r.amount, r.occurred_at from public.courier_receipts r
      where r.user_id = target and r.entered_by = auth.uid()
      union all
      select 'expense' as kind, e.description, e.amount, e.occurred_at from public.courier_expenses e
      where e.user_id = target and e.entered_by = auth.uid()
      order by occurred_at desc limit 8
    ) entry)
  ) into result from public.courier_accounts c where c.user_id = target;
  return result;
end;
$$;

create function public.courier_partner_add_receipt(
  p_shift_id uuid, p_amount numeric, p_method text, p_cash_received numeric default null, p_description text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid := private.courier_partner_target(); active_shift public.courier_shifts; created uuid;
begin
  if target is null then raise exception 'Partner logging unavailable'; end if;
  select * into active_shift from public.courier_shifts
    where id = p_shift_id and user_id = target and status in ('active', 'paused') for update;
  if active_shift.id is null then raise exception 'Active shift unavailable'; end if;
  insert into public.courier_receipts(user_id, platform_id, shift_id, amount, payment_method, cash_received, description)
    values (target, active_shift.platform_id, active_shift.id, p_amount, p_method, p_cash_received, coalesce(p_description, ''))
    returning id into created;
  return created;
end;
$$;

create function public.courier_partner_add_expense(
  p_shift_id uuid, p_category_id uuid, p_amount numeric, p_description text,
  p_method text default null, p_cash_paid numeric default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid := private.courier_partner_target(); active_shift public.courier_shifts; created uuid;
begin
  if target is null then raise exception 'Partner logging unavailable'; end if;
  select * into active_shift from public.courier_shifts
    where id = p_shift_id and user_id = target and status in ('active', 'paused') for update;
  if active_shift.id is null then raise exception 'Active shift unavailable'; end if;
  if not exists (select from public.courier_categories where id = p_category_id and user_id = target
    and active and kind = 'operational') then raise exception 'Work category unavailable'; end if;
  insert into public.courier_expenses(user_id, shift_id, category_id, amount, description, payment_method, cash_paid)
    values (target, active_shift.id, p_category_id, p_amount, p_description, p_method, p_cash_paid)
    returning id into created;
  return created;
end;
$$;

revoke execute on function public.courier_partner_context(),
  public.courier_partner_add_receipt(uuid,numeric,text,numeric,text),
  public.courier_partner_add_expense(uuid,uuid,numeric,text,text,numeric) from public, anon;
grant execute on function public.courier_partner_context(),
  public.courier_partner_add_receipt(uuid,numeric,text,numeric,text),
  public.courier_partner_add_expense(uuid,uuid,numeric,text,text,numeric) to authenticated;
