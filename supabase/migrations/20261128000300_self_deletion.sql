create function public.delete_own_account() returns text
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); home uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if exists (select from public.memberships m join public.spaces s on s.id = m.space_id
    where m.user_id = actor and s.state <> 'waiting') then return 'resolve_home_first'; end if;
  if exists (select from public.spaces where owner_id = actor and state <> 'waiting') then return 'resolve_home_first'; end if;
  if exists (select from public.expenses where space_id is not null and (owner_id = actor or paid_by = actor)) then
    return 'shared_expenses';
  end if;
  select s.id into home from public.spaces s where s.owner_id = actor and s.state = 'waiting' for update;
  if home is not null then delete from public.spaces where id = home; end if;
  delete from private.couple_introductions where author_id = actor;
  delete from public.expenses where owner_id = actor and space_id is null;
  delete from public.tasks where owner_id = actor and space_id is null;
  delete from auth.users where id = actor;
  if not found then raise exception 'Account unavailable'; end if;
  return 'deleted';
end;
$$;
revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
