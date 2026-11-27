-- Brief marks (agents-design D40): one `brief:<place>` record per project or domain (the place URI-encoded), so a
-- dismissed brief and a finished welcome hold on every device. Only the allowed key shapes change. The old check was
-- declared inline, so it's found by what it checks rather than by a generated name.
do $$
declare existing text;
begin
  select conname into existing from pg_constraint
    where conrelid = 'public.workspace_records'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%key ~%';
  if existing is not null then execute format('alter table public.workspace_records drop constraint %I', existing); end if;
end $$;
alter table public.workspace_records add constraint workspace_records_key_check
  check (key ~ '^(domains|routineRuns|projectOrder|initialized|(project|note|task|agent|thread|team|topic|brief):[^[:space:]]{1,200})$');
