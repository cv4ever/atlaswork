-- The desktop app's updates (agents-design D85, migration 20261125230000_desktop_updates.sql): a public bucket that
-- only the service role writes, so no account or signed-out caller can publish an update or take one away.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000901');

select results_eq($$ select public, file_size_limit from storage.buckets where id = 'desktop' $$,
  $$ values (true, 52428800::bigint) $$, 'the bucket is public, for installers up to 50 MB');

set local role service_role;
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('desktop', 'latest.json') $$, 'the release publishes');

set local role anon;
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('desktop', 'Atlaswork_9.9.9_x64-setup.exe') $$, '42501', null,
  'signed out, nothing can be published');
select is((select count(*)::int from storage.objects where bucket_id = 'desktop'), 0, 'nor listed through the API');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated"}';
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('desktop', 'Atlaswork_9.9.9_x64-setup.exe') $$, '42501', null,
  'an account can''t publish either');
-- Storage refuses deleting rows directly for every role, so only an update can try; the Storage API's own deletes
-- go through the same row-level security, which has no policy for this bucket.
update storage.objects set name = 'latest.old' where bucket_id = 'desktop';

reset role;
select results_eq($$ select name from storage.objects where bucket_id = 'desktop' and name like 'latest.%' $$, $$ values ('latest.json') $$,
  'and its update reaches nothing: latest.json stays as published');

select * from finish();
rollback;
