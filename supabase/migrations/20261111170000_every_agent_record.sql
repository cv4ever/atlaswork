-- Settings → Every agent (agents-design D46): one `everyAgent` record holds the house rules every agent reads, the
-- personality an agent without its own follows, and the tools a new agent starts with. Only the allowed key shapes
-- change, the same way 20261108170000_brief_records.sql did.
do $$
declare existing text;
begin
  select conname into existing from pg_constraint
    where conrelid = 'public.workspace_records'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%key ~%';
  if existing is not null then execute format('alter table public.workspace_records drop constraint %I', existing); end if;
end $$;
alter table public.workspace_records add constraint workspace_records_key_check
  check (key ~ '^(domains|routineRuns|projectOrder|initialized|everyAgent|(project|note|task|agent|thread|team|topic|brief):[^[:space:]]{1,200})$');
