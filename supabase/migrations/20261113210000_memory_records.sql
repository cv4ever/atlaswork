-- What agents remember (agents-design D49): one `memory:<id>` record per memory. Only the allowed key shapes change,
-- the same way 20261111170000_every_agent_record.sql did.
do $$
declare existing text;
begin
  select conname into existing from pg_constraint
    where conrelid = 'public.workspace_records'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%key ~%';
  if existing is not null then execute format('alter table public.workspace_records drop constraint %I', existing); end if;
end $$;
alter table public.workspace_records add constraint workspace_records_key_check
  check (key ~ '^(domains|routineRuns|projectOrder|initialized|everyAgent|(project|note|task|agent|thread|team|topic|brief|memory):[^[:space:]]{1,200})$');
