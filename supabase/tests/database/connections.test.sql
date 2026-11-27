-- Connections to outside accounts (agents-design D74): nobody but the service role reads or writes a token; an account
-- sees which providers it connected and as whom, and only its own.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000301'), ('00000000-0000-0000-0000-000000000302');

reset role;
set local role service_role;
select lives_ok($$ select public.set_connection_of('00000000-0000-0000-0000-000000000301', 'google_calendar', 'me@example.com', 'v1.sealed') $$,
  'the connectors function stores a sealed token');
select lives_ok($$ select public.set_connection_of('00000000-0000-0000-0000-000000000302', 'google_calendar', 'other@example.com', 'v1.other') $$,
  'another account connects too');
select throws_ok($$ select public.set_connection_of('00000000-0000-0000-0000-000000000301', 'gmail', '', 'v1.x') $$, '23514', null,
  'only known providers');
select results_eq($$ select account, token from public.connection_of('00000000-0000-0000-0000-000000000301', 'google_calendar') $$,
  $$ values ('me@example.com', 'v1.sealed') $$, 'the agent function reads it back');

set local role anon;
select throws_ok($$ select public.my_connections() $$, '42501', null, 'signed-out callers see nothing');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}';
select results_eq($$ select provider, account from public.my_connections() $$, $$ values ('google_calendar', 'me@example.com') $$,
  'an account sees its own connection, without the token');
select throws_ok($$ select token from public.connections $$, '42501', null, 'the table is closed to accounts');
select throws_ok($$ select public.connection_of('00000000-0000-0000-0000-000000000302', 'google_calendar') $$, '42501', null,
  'an account cannot read another account''s token');
select throws_ok($$ select public.drop_connection_of('00000000-0000-0000-0000-000000000302', 'google_calendar') $$, '42501', null,
  'an account cannot remove another account''s connection');

reset role;
set local role service_role;
select is(public.drop_connection_of('00000000-0000-0000-0000-000000000301', 'google_calendar'), 'v1.sealed', 'disconnecting hands back the token to revoke');
select is((select count(*) from public.connections where user_id = '00000000-0000-0000-0000-000000000301')::int, 0, 'and the row is gone');

select * from finish();
rollback;
