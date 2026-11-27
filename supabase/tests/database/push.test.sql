-- Push notifications (agents-design D55): who may store, read and forget a device's subscription, and quiet hours.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
insert into auth.users (id, invited_at) values ('00000000-0000-0000-0000-000000000301', now()), ('00000000-0000-0000-0000-000000000302', now());

set local role anon;
select throws_ok($$ select public.save_push('https://push.example.test/a', 'key', 'auth') $$, '42501', null, 'signed-out callers cannot subscribe');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}';
select lives_ok($$ select public.save_push('https://push.example.test/a', 'key', 'auth') $$, 'an account stores this device''s subscription');
select throws_ok($$ select public.save_push('http://push.example.test/b', 'key', 'auth') $$, '23514', null, 'only an https push service is accepted');
select throws_ok($$ select endpoint from public.push_subscriptions $$, '42501', null, 'subscriptions are not readable through the API');
select lives_ok($$ select public.set_quiet_hours(1320::smallint, 420::smallint) $$, 'an account sets its quiet hours');
select throws_ok($$ select public.set_quiet_hours(1440::smallint, 0::smallint) $$, '23514', null, 'a time past midnight is refused');
select throws_ok($$ select public.pushes_of('00000000-0000-0000-0000-000000000301') $$, '42501', null, 'an account cannot read subscriptions through the server''s function');

-- The same browser signed in as someone else moves its subscription along; the old account's forget can't touch it.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000302","role":"authenticated"}';
select lives_ok($$ select public.save_push('https://push.example.test/a', 'key2', 'auth2') $$, 'a browser that changes account moves its subscription');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}';
select public.forget_push('https://push.example.test/a');

set local role service_role;
select results_eq($$ select endpoint, p256dh from public.pushes_of('00000000-0000-0000-0000-000000000302') $$,
  $$ values ('https://push.example.test/a', 'key2') $$, 'the new account owns it, untouched by the old account''s forget');
select results_eq($$ select quiet_from, quiet_to from public.away_settings where user_id = '00000000-0000-0000-0000-000000000301' $$,
  $$ values (1320::smallint, 420::smallint) $$, 'quiet hours are kept');
select lives_ok($$ select public.drop_push('https://push.example.test/a') $$, 'the server drops a subscription the push service forgot');
select * from finish();
rollback;
