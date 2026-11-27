-- Which link and form a signup came from, for per-channel counts without analytics cookies (launch plan step 2):
-- "<utm_source>:<utm_content>:<hero|footer>", empty parts allowed. Never personal data.
alter table public.waitlist add column source text not null default ''
  check (source = '' or (length(source) <= 120 and source ~ '^[a-z0-9_.-]*:[a-z0-9_.-]*:[a-z]*$'));
grant insert (source) on public.waitlist to anon, authenticated;
