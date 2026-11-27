-- Routines while you're away (agents-design D54): who may report being seen and flip the switch, who may run another
-- account's routines, and which accounts the routines function picks.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000201'), ('00000000-0000-0000-0000-000000000202'),
  ('00000000-0000-0000-0000-000000000203'), ('00000000-0000-0000-0000-000000000204'), ('00000000-0000-0000-0000-000000000205');

set local role anon;
select throws_ok($$ select public.seen_app('Europe/Lisbon') $$, '42501', null, 'signed-out callers cannot report being seen');
select throws_ok($$ select public.set_away(true) $$, '42501', null, 'signed-out callers cannot flip the switch');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated","is_anonymous":true}';
select throws_ok($$ select public.seen_app('Europe/Lisbon') $$, '42501', null, 'anonymous accounts have no away settings');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated"}';
select lives_ok($$ select public.seen_app('America/New_York') $$, 'an account reports its time zone');
select throws_ok($$ select public.seen_app('Mars/Olympus_Mons') $$, '22023', null, 'a zone Postgres does not know is refused');
select lives_ok($$ select public.set_away(true, 'Carlos', 'Builds things') $$, 'an account turns routines on and keeps its name');
select results_eq($$ select run_away, time_zone, person_name, person_about from public.away_settings $$,
  $$ values (true, 'America/New_York', 'Carlos', 'Builds things') $$, 'the account reads back its own settings');
select lives_ok($$ select public.set_away(p_person_about => 'Gardens too') $$, 'a partial update keeps the rest');
select results_eq($$ select run_away, person_name, person_about from public.away_settings $$, $$ values (true, 'Carlos', 'Gardens too') $$, 'only the about changed');
select throws_ok($$ update public.away_settings set run_away = false $$, '42501', null, 'the table itself is read-only to the account');
select throws_ok($$ select public.away_accounts() $$, '42501', null, 'an account cannot list who runs away');
select throws_ok($$ select public.claim_routine_of('00000000-0000-0000-0000-000000000202', 'r', '2026-11-16T08:00:00Z') $$, '42501', null,
  'an account cannot claim another account''s routine');
select throws_ok($$ select public.save_workspace_of('00000000-0000-0000-0000-000000000202', '{}', '{}') $$, '42501', null,
  'an account cannot write another account''s workspace');
select throws_ok($$ select public.load_workspace_of('00000000-0000-0000-0000-000000000202') $$, '42501', null,
  'an account cannot read another account''s workspace');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000202","role":"authenticated"}';
select is((select count(*) from public.away_settings)::int, 0, 'another account sees nobody else''s settings');

-- Who the function runs: 201 (opted in, closed 20 minutes ago, on a trial); not 202 (app open now), 203 (away 8 days),
-- 204 (no plan and no model of its own) or 205 (never opted in).
reset role;
insert into public.away_settings (user_id, run_away, time_zone, last_seen) values
  ('00000000-0000-0000-0000-000000000202', true, 'UTC', now()),
  ('00000000-0000-0000-0000-000000000203', true, 'UTC', now() - interval '8 days'),
  ('00000000-0000-0000-0000-000000000204', true, 'UTC', now() - interval '20 minutes'),
  ('00000000-0000-0000-0000-000000000205', false, 'UTC', now() - interval '20 minutes');
update public.away_settings set last_seen = now() - interval '20 minutes' where user_id = '00000000-0000-0000-0000-000000000201';
update public.entitlements set plan = 'free', trial_ends_at = null where user_id = '00000000-0000-0000-0000-000000000204';
set local role service_role;
select results_eq($$ select user_id::text, time_zone, person_name from public.away_accounts() $$,
  $$ values ('00000000-0000-0000-0000-000000000201', 'America/New_York', 'Carlos') $$, 'only an opted-in, closed, recently seen account that can answer runs');
select is(public.claim_routine_of('00000000-0000-0000-0000-000000000201', 'r', '2026-11-16T08:00:00Z')->'claimed', 'true'::jsonb,
  'the function claims for the account it runs');
select is(public.claim_routine_of('00000000-0000-0000-0000-000000000201', 'r', '2026-11-16T08:00:00Z')->'claimed', 'false'::jsonb,
  'and the same occurrence is not claimed twice, by the server or a device');
select * from finish();
rollback;
