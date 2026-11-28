create function public.courier_update_vehicle_odometer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and new.odometer_end is not null
    and new.odometer_end is distinct from old.odometer_end then
    update public.courier_vehicles set odometer_km = greatest(coalesce(odometer_km, 0), new.odometer_end)
      where user_id = new.user_id;
  end if;
  return new;
end;
$$;
create trigger courier_vehicle_last_reading after update of status, odometer_end on public.courier_shifts
for each row execute function public.courier_update_vehicle_odometer();
