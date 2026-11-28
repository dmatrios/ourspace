alter table public.tasks
  add column priority text not null default 'medium'
    check (priority in ('high', 'medium', 'low')),
  add column due_on date,
  add column requirements text
    check (requirements is null or char_length(trim(requirements)) <= 500);

create index tasks_backlog_order on public.tasks(completed, priority, due_on);

grant insert (owner_id, space_id, title, priority, due_on, requirements) on public.tasks to authenticated;
grant update (priority, due_on, requirements) on public.tasks to authenticated;
