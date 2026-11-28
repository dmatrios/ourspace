create policy ourspace_room_presence_read on realtime.messages
for select to authenticated using (
  realtime.messages.extension in ('presence', 'broadcast')
  and exists (
    select from public.memberships m
    join public.spaces s on s.id = m.space_id
    where m.user_id = (select auth.uid())
      and s.state = 'paired'
      and (select realtime.topic()) = 'ourspace:room:' || s.id::text
  )
);

create policy ourspace_room_presence_write on realtime.messages
for insert to authenticated with check (
  realtime.messages.extension in ('presence', 'broadcast')
  and exists (
    select from public.memberships m
    join public.spaces s on s.id = m.space_id
    where m.user_id = (select auth.uid())
      and s.state = 'paired'
      and (select realtime.topic()) = 'ourspace:room:' || s.id::text
  )
);
