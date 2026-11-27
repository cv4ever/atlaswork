-- The security boundaries of the agent caps, the waitlist, entitlements and the server workspace (launch plan
-- steps 2, 4 and 5). Run: pnpm exec supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(83);

insert into auth.users (id, invited_at) values ('00000000-0000-0000-0000-000000000001', now()), ('00000000-0000-0000-0000-000000000002', now());
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-000000000003', true);
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000004');

-- The waitlist: only the waitlist function (service role, after a Turnstile check) adds an email and a source.
set local role anon;
select throws_ok($$ insert into public.waitlist (email, source) values ('pgtap-a@example.test', 'linkedin:workspace:hero') $$, '42501', null, 'anon cannot add an email directly');
select throws_ok($$ select email from public.waitlist $$, '42501', null, 'anon cannot read the waitlist');
select throws_ok($$ delete from public.waitlist $$, '42501', null, 'anon cannot delete from the waitlist');
set local role service_role;
select lives_ok($$ insert into public.waitlist (email, source) values ('pgtap-a@example.test', 'linkedin:workspace:hero') $$, 'the waitlist function adds an email with a source');
select throws_ok($$ insert into public.waitlist (email) values ('pgtap-a@example.test') $$, '23505', null, 'a duplicate email is refused');
select throws_ok($$ insert into public.waitlist (email) values ('not-an-email') $$, '23514', null, 'an invalid email is refused');
select throws_ok($$ insert into public.waitlist (email, source) values ('pgtap-b@example.test', '<x>::hero') $$, '23514', null, 'a source outside the format is refused');
set local role anon;

-- Usage counts: anyone adds one to a known moment; nobody reads, edits or invents one.
select lives_ok($$ select public.count_usage(e) from (values ('onboarding_shown'), ('onboarding_shown')) as v (e) $$, 'anon counts a moment');
select throws_ok($$ select public.count_usage('my_email@example.test') $$, '23514', null, 'an unknown moment is refused');
select throws_ok($$ select count from public.usage_counts $$, '42501', null, 'anon cannot read the counts');
select throws_ok($$ update public.usage_counts set count = 0 $$, '42501', null, 'anon cannot change a count');
set local role service_role;
select lives_ok($$ select public.count_usage('memory_learned') $$, 'the agent function counts a place it offered to remember (D80)');
reset role;
select is((select count from public.usage_counts where event = 'onboarding_shown' and day = current_date), 2, 'the day keeps one row with the total');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'usage_counts'), 3, 'the table holds only day, moment and count');

-- Agent usage: callers can neither count their own replies nor erase their spend.
set local role authenticated;
select throws_ok($$ select public.begin_agent_reply('00000000-0000-0000-0000-000000000001', 1000000, 1000000000) $$, '42501', null, 'a user cannot raise their own cap');
select throws_ok($$ select public.record_agent_neurons('00000000-0000-0000-0000-000000000001', -100) $$, '42501', null, 'a user cannot record spend');
select throws_ok($$ update public.agent_usage set replies = 0 $$, '42501', null, 'a user cannot edit usage rows');

-- The service role (the agent function) enforces the per-user cap and the shared budget.
set local role service_role;
select is(array[public.begin_agent_reply('00000000-0000-0000-0000-000000000001', 1, 100),
  public.begin_agent_reply('00000000-0000-0000-0000-000000000001', 1, 100)], array['ok', 'user'], 'the second reply past a cap of 1 is refused');
select lives_ok($$ select public.record_agent_neurons('00000000-0000-0000-0000-000000000001', 100) $$, 'the service role records spend');
select is(public.begin_agent_reply('00000000-0000-0000-0000-000000000002', 10, 100), 'budget', 'another user is refused once the day''s budget is spent');
select is((select neurons from public.agent_usage where user_id = '00000000-0000-0000-0000-000000000001'), 100, 'spend is recorded against the user');
select is(public.begin_agent_reply('00000000-0000-0000-0000-000000000003', 10, 1000000), 'plan', 'an anonymous user gets no live replies');
update public.entitlements set trial_ends_at = now() - interval '1 day' where user_id = '00000000-0000-0000-0000-000000000002';
select is(public.begin_agent_reply('00000000-0000-0000-0000-000000000002', 10, 1000000), 'plan', 'an ended trial gets no live replies');
select is(public.begin_agent_reply('00000000-0000-0000-0000-000000000002', 10, 100, true), 'ok', 'an own model needs no plan and no shared budget');
select is(public.begin_agent_reply('00000000-0000-0000-0000-000000000001', 10, 1000000, false, 100), 'share', 'a user past their share of the budget is refused');
select is(public.begin_agent_reply('00000000-0000-0000-0000-000000000001', 10, 1000000, true, 100), 'ok', 'an own model skips the share');
-- Work handed off (agents-design D73) takes several replies at once, only when all of them fit under the cap.
select is(public.begin_agent_reply('00000000-0000-0000-0000-000000000002', 3, 100, true, null, 3), 'user', 'three more replies past a cap of 3 are refused whole');
select is(public.begin_agent_reply('00000000-0000-0000-0000-000000000002', 4, 100, true, null, 3), 'ok', 'three more fit under a cap of 4');

-- Signups: Auth's before-user-created hook refuses disposable addresses, subdomains included, and nobody else calls it.
reset role;
select is(public.hook_before_user_created('{"user": {"email": "x@mailinator.com"}}') #>> '{error,http_code}', '403', 'a disposable domain is refused');
select is(public.hook_before_user_created('{"user": {"email": "x@eu.Mailinator.com"}}') #>> '{error,http_code}', '403', 'a subdomain of one is refused');
select is(public.hook_before_user_created('{"user": {"email": "ana@gmail.com"}}'), '{}'::jsonb, 'an ordinary address is allowed');
set local role authenticated;
select throws_ok($$ select public.hook_before_user_created('{}') $$, '42501', null, 'users cannot call the signup hook');
set local role service_role;

select is((select plan from public.entitlements where user_id = '00000000-0000-0000-0000-000000000004'), 'free',
  'an account that signed itself up starts on Free, without the hosted model');

-- Entitlements: an invited account starts a trial and can read but never change it.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select is((select plan from public.entitlements), 'trial', 'an invited account reads its own trial, and only its own');
select throws_ok($$ update public.entitlements set plan = 'pro' $$, '42501', null, 'a user cannot upgrade themselves');
select throws_ok($$ insert into public.entitlements (user_id, plan) values ('00000000-0000-0000-0000-000000000001', 'pro') $$, '42501', null, 'a user cannot grant themselves a plan');

-- The workspace: each account sees and changes only its own records, one changeset at a time.
select lives_ok($$ select public.save_workspace('{"initialized": true, "task:a": {"id": "a"}, "note:n": {"id": "n"}}', '{}') $$, 'a user saves records');
select lives_ok($$ select public.save_workspace('{"task:b": {"id": "b"}}', '{note:n}') $$, 'upserts and deletes in one call');
select is(public.load_workspace(), '{"initialized": true, "task:a": {"id": "a"}, "task:b": {"id": "b"}}'::jsonb, 'load returns exactly what was saved');
select throws_ok($$ select public.save_workspace('{"task:c": {"id": "c"}, "secret": 1}', '{}') $$, '23514', null, 'an unknown key refuses the whole changeset');
select is(public.load_workspace() ? 'task:c', false, 'a refused changeset leaves nothing behind');
select lives_ok($$ select public.save_workspace('{"initialized": true, "task:z": {"id": "z"}}', '{}', true) $$, 'replace swaps the workspace');
select is(public.load_workspace(), '{"initialized": true, "task:z": {"id": "z"}}'::jsonb, 'replace drops every earlier record');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';
select is(public.load_workspace(), '{}'::jsonb, 'another account sees none of it');
select lives_ok($$ select public.save_workspace('{}', '{task:z}', true) $$, 'another account''s replace and delete run');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select is(public.load_workspace(), '{"initialized": true, "task:z": {"id": "z"}}'::jsonb, '...and leave the first account''s records alone');
select throws_ok($$ insert into public.workspace_records (key, value) values ('task:x', '{}') $$, '42501', null, 'writes go only through save_workspace, so the size cap holds');
select throws_ok($$ select public.save_workspace((select jsonb_object_agg('note:' || i, jsonb_build_object('b', repeat('x', 999000))) from generate_series(1, 26) as i), '{}') $$,
  '53400', null, 'a changeset that takes the workspace past 25 MB is refused');
select is(public.load_workspace() ? 'note:1', false, 'a refused changeset over the cap leaves nothing behind');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated", "is_anonymous": true}';
select throws_ok($$ select public.save_workspace('{"task:a": {"id": "a"}}', '{}') $$, '42501', null, 'an anonymous user cannot store a workspace');

-- An own model's key goes in, never comes out, and leaves with the account.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select lives_ok($$ select public.set_model_key('openai', 'https://api.example.com/v1', 'some-model', 'sk-test-12345678') $$, 'a user saves their own key');
select is(public.model_key_status(), '{"provider": "openai", "base_url": "https://api.example.com/v1", "model": "some-model", "hint": "…5678", "effort": null}'::jsonb, 'the app sees a hint, never the key');
select throws_ok($$ select * from public.model_keys $$, '42501', null, 'the key table is closed to users');
select throws_ok($$ select public.model_key_for('00000000-0000-0000-0000-000000000001') $$, '42501', null, 'users cannot decrypt keys');
select throws_ok($$ select public.set_model_key('openai', 'https://10.0.0.1/v1', 'm', 'sk-test-12345678') $$, '23514', null, 'a key cannot point the function at an address');
select throws_ok($$ select public.set_model_key('openai', 'http://api.example.com/v1', 'm', 'sk-test-12345678') $$, '23514', null, 'nor at plain http');
select lives_ok($$ select public.set_model_key('openai', 'https://api.example.com/v1', 'other-model', null) $$, 'changing the model keeps the key');
reset role;
select is(public.model_key_for('00000000-0000-0000-0000-000000000001') ->> 'key', 'sk-test-12345678', 'the agent function reads the stored key');
select is(public.model_key_for('00000000-0000-0000-0000-000000000001') ->> 'model', 'other-model', '...with the new model');
set local role authenticated;

-- Shared agents: config only, anyone browses, owners share and unshare their own, and spam is capped.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select lives_ok($$ select public.share_agent('10000000-0000-0000-0000-000000000001', 'Vital', 'vital', 'Health coach', 'Be kind.', 'propose', '{"web": true}') $$, 'a user shares an agent');
select is((select count(*)::int from public.shared_agents), 1, 'everyone can browse it');
select lives_ok($$ select public.share_agent('10000000-0000-0000-0000-000000000001', 'Vital', 'vital', 'Sleep coach', 'Be kind.', 'propose', '{}') $$, 'sharing the same agent again updates it');
select is((select role from public.shared_agents), 'Sleep coach', '...in place, not as a second entry');
select is((select array_agg(x) from public.my_shared_agents() as x), array['10000000-0000-0000-0000-000000000001']::uuid[], 'the owner sees which of their agents are shared');
select throws_ok($$ select owner from public.shared_agents $$, '42501', null, 'who shared it is never exposed');
select throws_ok($$ insert into public.shared_agents (owner, source_agent, name, portrait, role, instructions, write_mode) values ('00000000-0000-0000-0000-000000000001', gen_random_uuid(), 'x', 'x', '', '', 'full') $$, '42501', null, 'shares go only through share_agent');
select throws_ok($$ select public.share_agent(gen_random_uuid(), 'Vital', 'vital', 'x', 'x', 'edit', '{}') $$, '23514', null, 'an unknown write mode is refused');
select throws_ok($$ select public.share_agent(gen_random_uuid(), 'Vital', '../atlas', 'x', 'x', 'full', '{}') $$, '23514', null, 'a portrait outside the face names is refused');
select throws_ok($$ select public.share_agent(gen_random_uuid(), 'Vital', 'vital', 'x', repeat('x', 2001), 'full', '{}') $$, '23514', null, 'instructions over 2000 characters are refused');
select lives_ok($$ select public.share_agent(gen_random_uuid(), 'A' || i, 'vital', '', '', 'full', '{}') from generate_series(1, 19) as i $$, 'up to 20 shares are allowed');
select throws_ok($$ select public.share_agent(gen_random_uuid(), 'One more', 'vital', '', '', 'full', '{}') $$, '53400', null, 'the 21st share is refused');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';
select lives_ok($$ select public.unshare_agent('10000000-0000-0000-0000-000000000001') $$, 'another account''s unshare runs');
select is((select count(*)::int from public.shared_agents where name = 'Vital'), 1, '...but removes nothing of someone else''s');
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated", "is_anonymous": true}';
select throws_ok($$ select public.share_agent(gen_random_uuid(), 'x', 'vital', '', '', 'full', '{}') $$, '42501', null, 'an anonymous user cannot share');
set local role anon;
select is((select count(*)::int from public.shared_agents), 20, 'signed-out visitors browse shared agents');
select throws_ok($$ select public.share_agent(gen_random_uuid(), 'x', 'vital', '', '', 'full', '{}') $$, '42501', null, 'signed-out visitors cannot share');
set local role authenticated;

-- Account deletion removes the caller and everything that cascades from them, and nobody else.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';
select lives_ok($$ select public.delete_my_account() $$, 'a user deletes their own account');
reset role;
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-000000000001'), 0, 'the user is gone');
select is((select count(*)::int from public.workspace_records where user_id = '00000000-0000-0000-0000-000000000001')
  + (select count(*)::int from public.entitlements where user_id = '00000000-0000-0000-0000-000000000001')
  + (select count(*)::int from public.agent_usage where user_id = '00000000-0000-0000-0000-000000000001')
  + (select count(*)::int from public.shared_agents where owner = '00000000-0000-0000-0000-000000000001'), 0, 'their workspace, plan, usage and shares go with them');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-000000000002'), 1, 'other accounts stay');
select is((select count(*)::int from vault.secrets where name = 'model_key_00000000-0000-0000-0000-000000000001'), 0, 'their encrypted model key goes too');
set local role anon;
select throws_ok($$ select public.load_workspace() $$, '42501', null, 'signed-out callers cannot load a workspace');
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'signed-out callers cannot delete an account');

select * from finish();
rollback;
