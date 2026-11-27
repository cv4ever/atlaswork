-- The Atlaswork landing page's waitlist (landing/). Anyone may add an email; nobody can read the list through the API.
create table public.waitlist (
  email text primary key check (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now()
);
alter table public.waitlist enable row level security;
create policy "Anyone can join the waitlist" on public.waitlist for insert to anon, authenticated with check (true);
revoke select, insert, update, delete on public.waitlist from anon, authenticated;
grant insert (email) on public.waitlist to anon, authenticated;
