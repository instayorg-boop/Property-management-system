-- Priority is never hand-picked at submission time (not by the landlord, not by the tenant) — it
-- starts at the column default ('medium') and this trigger immediately fires off AI classification
-- against the location/description, same invoke_edge_function/cron-secret pattern the maintenance
-- notification SMS trigger already uses. The landlord can still edit the result by hand afterward;
-- this only sets the starting point.
create or replace function public.classify_new_maintenance_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.invoke_edge_function(
    'classify-maintenance-priority',
    jsonb_build_object('reportId', new.id, 'location', new.location, 'description', new.description)
  );
  return new;
end;
$$;

drop trigger if exists trg_classify_new_maintenance_report on public.maintenance_reports;
create trigger trg_classify_new_maintenance_report
  after insert on public.maintenance_reports
  for each row execute function public.classify_new_maintenance_report();
