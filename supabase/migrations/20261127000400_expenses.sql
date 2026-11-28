create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  space_id uuid references public.spaces(id) on delete cascade,
  paid_by uuid not null references auth.users(id) on delete restrict,
  occurred_on date not null,
  amount numeric(12,2) not null check (amount > 0),
  category text not null check (category in ('food', 'home', 'transport', 'health', 'fun', 'other')),
  description text not null check (char_length(trim(description)) between 1 and 200),
  created_at timestamptz not null default now(),
  check (space_id is not null or paid_by = owner_id)
);

create index expenses_owner_date on public.expenses(owner_id, occurred_on desc);
create index expenses_space_date on public.expenses(space_id, occurred_on desc) where space_id is not null;

create function private.check_expense_payer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.paid_by is not distinct from old.paid_by then return new; end if;
  end if;
  if new.space_id is not null and not exists (
    select from public.memberships where space_id = new.space_id and user_id = new.paid_by
  ) then raise exception 'Payer must be a current space member'; end if;
  return new;
end;
$$;
create trigger expense_payer_guard before insert or update of paid_by, space_id on public.expenses
for each row execute function private.check_expense_payer();

alter table public.expenses enable row level security;
revoke all on public.expenses from public, anon, authenticated;
grant select, delete on public.expenses to authenticated;
grant insert (owner_id, space_id, paid_by, occurred_on, amount, category, description) on public.expenses to authenticated;
grant update (paid_by, occurred_on, amount, category, description) on public.expenses to authenticated;

create policy read_expenses on public.expenses for select to authenticated using (
  (space_id is null and owner_id = (select auth.uid()))
  or exists (select from public.memberships where space_id = expenses.space_id and user_id = (select auth.uid()))
);
create policy add_expenses on public.expenses for insert to authenticated with check (
  owner_id = (select auth.uid()) and (
    (space_id is null and paid_by = (select auth.uid()))
    or exists (
      select from public.spaces s join public.memberships m on m.space_id = s.id
      where s.id = expenses.space_id and s.state in ('paired', 'retained') and m.user_id = (select auth.uid())
    )
  )
);
create policy edit_expenses on public.expenses for update to authenticated using (
  (space_id is null and owner_id = (select auth.uid()))
  or exists (
    select from public.spaces s join public.memberships m on m.space_id = s.id
    where s.id = expenses.space_id and s.state in ('paired', 'retained') and m.user_id = (select auth.uid())
  )
) with check (
  (space_id is null and owner_id = (select auth.uid()) and paid_by = (select auth.uid()))
  or exists (
    select from public.spaces s join public.memberships m on m.space_id = s.id
    where s.id = expenses.space_id and s.state in ('paired', 'retained') and m.user_id = (select auth.uid())
  )
);
create policy remove_expenses on public.expenses for delete to authenticated using (
  (space_id is null and owner_id = (select auth.uid()))
  or exists (
    select from public.spaces s join public.memberships m on m.space_id = s.id
    where s.id = expenses.space_id and s.state in ('paired', 'retained') and m.user_id = (select auth.uid())
  )
);

create function public.household_member_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.user_id order by m.user_id), array[]::uuid[])
  from public.memberships m
  where m.space_id = (select mine.space_id from public.memberships mine where mine.user_id = auth.uid());
$$;
revoke execute on function public.household_member_ids() from public, anon;
grant execute on function public.household_member_ids() to authenticated;

create or replace function public.export_separated_space() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'format', 4, 'space_id', s.id,
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
        'id', t.id, 'title', t.title, 'completed', t.completed,
        'priority', t.priority, 'due_on', t.due_on, 'requirements', t.requirements,
        'created_at', t.created_at
      ) order by t.created_at)
      from public.tasks t where t.space_id = s.id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'description', e.description, 'amount', e.amount,
        'category', e.category, 'occurred_on', e.occurred_on,
        'paid_by', e.paid_by, 'created_at', e.created_at
      ) order by e.occurred_on, e.created_at)
      from public.expenses e where e.space_id = s.id
    ), '[]'::jsonb)
  )
  from public.spaces s left join public.room_styles r on r.space_id = s.id
  where s.owner_id = auth.uid() and s.state = 'separated';
$$;
