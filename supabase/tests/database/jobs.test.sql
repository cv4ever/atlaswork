-- Jobs (agents-design D76): only the service role creates, claims, reports and ends them; a job is claimed once, again
-- only after its run's lease is over, and only where it may run; an account reads how its own jobs go but never their
-- requests; a job drops its request when it ends or expires, and goes 7 days after it ended.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000401'), ('00000000-0000-0000-0000-000000000402');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}';
select throws_ok($$ select public.create_job('00000000-0000-0000-0000-000000000401', 'handoff', 'atlas', 'agent:atlas', 'm1', '{}') $$, '42501', null,
  'an account cannot create a job itself');
select throws_ok($$ insert into public.agent_jobs (user_id, kind, agent_id, thread_id, message_id) values
  ('00000000-0000-0000-0000-000000000401', 'handoff', 'atlas', 'agent:atlas', 'm1') $$, '42501', null, 'nor write the table');
select throws_ok($$ select public.claim_job(gen_random_uuid(), 'server:x') $$, '42501', null, 'nor claim one');
select throws_ok($$ select public.finish_job(gen_random_uuid(), 'server:x', 'done') $$, '42501', null, 'nor end one');
select throws_ok($$ select public.expire_jobs() $$, '42501', null, 'nor expire them');

set local role service_role;
create temporary table job on commit drop as
  select public.create_job('00000000-0000-0000-0000-000000000401', 'handoff', 'atlas', 'agent:atlas', 'm1', '{"request": "Plan my week"}') as id;
select is((select public.claim_job(id, 'server:run-1') ->> 'request' from job), '{"request": "Plan my week"}', 'a run claims the waiting job and gets its request');
select is((select public.claim_job(id, 'server:run-2') from job), null::jsonb, 'a second run gets nothing while the first holds it');
select ok((select public.job_progress(id, 'server:run-1', 'Reading notes') from job), 'the holder reports progress');
select ok(not (select public.job_progress(id, 'server:run-2', 'Reading tasks') from job), 'another run cannot');

set local role authenticated;
select results_eq($$ select state, progress, runs from public.agent_jobs $$, $$ values ('running', 'Reading notes', 1) $$,
  'the account reads how its job goes');
select throws_ok($$ select request from public.agent_jobs $$, '42501', null, 'but not its request');
select throws_ok($$ select worker from public.agent_jobs $$, '42501', null, 'nor who holds it');
select throws_ok($$ update public.agent_jobs set state = 'done' $$, '42501', null, 'nor change it');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000402","role":"authenticated"}';
select is((select count(*) from public.agent_jobs)::int, 0, 'another account sees none of it');

-- A run that dies leaves the job to the next once its lease is over.
reset role;
update public.agent_jobs set lease_until = now() - interval '1 second';
set local role service_role;
select is((select (public.claim_job(id, 'server:run-3') ->> 'runs')::int from job), 2, 'a later run takes over a job whose run died');
select ok(not (select public.finish_job(id, 'server:run-1', 'done') from job), 'the run that died can no longer end it');
select ok((select public.finish_job(id, 'server:run-3', 'done') from job), 'the holder ends it');
reset role;
select results_eq($$ select state, request, progress, ended_at is not null from public.agent_jobs $$, $$ values ('done', null::jsonb, null::text, true) $$,
  'an ended job keeps no request');
set local role service_role;
select is((select public.claim_job(id, 'server:run-4') from job), null::jsonb, 'an ended job is never claimed again');

-- Where it may run (D77): a job for a computer waits for that computer.
select is(public.claim_job(public.create_job('00000000-0000-0000-0000-000000000401', 'handoff', 'atlas', 'agent:atlas', 'm2', '{}', 'computer:office'),
  'server:run-5'), null::jsonb, 'the server leaves a computer''s job alone');
select is(public.claim_job((select id from public.agent_jobs where message_id = 'm2'), 'computer:office') ->> 'message', 'm2',
  'that computer claims it');

-- A reply paused for this device's files (D47) waits for the leg that brings them.
select ok(public.release_job((select id from public.agent_jobs where message_id = 'm2'), 'computer:office', 'device:nonce-1'),
  'the holder lets the job wait for the device');
select is(public.claim_job((select id from public.agent_jobs where message_id = 'm2'), 'server:run-6'), null::jsonb, 'the server leaves it alone');
select is(public.claim_job((select id from public.agent_jobs where message_id = 'm2'), 'device:nonce-1') ->> 'runs', '2',
  'the leg that resumes with the files claims it');
select ok(not public.release_job((select id from public.agent_jobs where message_id = 'm2'), 'computer:office', 'server'),
  'a worker that no longer holds it cannot let it go');
set local role authenticated;
select throws_ok($$ select public.release_job(gen_random_uuid(), 'server:x', 'server') $$, '42501', null, 'an account cannot let a job go');
set local role service_role;

-- A long hand-off goes on across runs: a run lets it wait with what it did so far, the next run gets it back.
select public.create_job('00000000-0000-0000-0000-000000000401', 'handoff', 'atlas', 'agent:atlas', 'm4', '{"request": "Long"}');
select ok(public.claim_job((select id from public.agent_jobs where message_id = 'm4'), 'server:run-7') is not null, 'the first run claims it');
select ok(public.release_job((select id from public.agent_jobs where message_id = 'm4'), 'server:run-7', 'server',
  '[{"role": "assistant", "content": ""}]', '[{"tool": "read_notes"}]', 100000), 'the run lets it wait with its turns, after 100 s');
select results_eq($$ select (j ->> 'runs')::int, j -> 'turns', j -> 'used', (j ->> 'ms')::int
  from public.claim_job((select id from public.agent_jobs where message_id = 'm4'), 'server:run-8') as j $$,
  $$ values (2, '[{"role": "assistant", "content": ""}]'::jsonb, '[{"tool": "read_notes"}]'::jsonb, 100000) $$, 'the next run carries on from them');
select ok(public.release_job((select id from public.agent_jobs where message_id = 'm4'), 'server:run-8', 'server', null, null, 90000), 'it lets it wait again');
select is((select ms from public.agent_jobs where message_id = 'm4'), 190000, 'their running time adds up');

-- Moving between computers (D84, migration 20261125210000_job_moves.sql): letting a job wait for another worker may
-- replace its request, which then says where it runs; without one the request stays, as above.
select public.create_job('00000000-0000-0000-0000-000000000401', 'reply', 'atlas', 'agent:atlas', 'm7', to_jsonb('{"request": "Find it"}'::text));
select ok(public.claim_job((select id from public.agent_jobs where message_id = 'm7'), 'server:run-20') is not null, 'a run claims a reply');
select ok(public.release_job((select id from public.agent_jobs where message_id = 'm7'), 'server:run-20', 'computer:laptop', null, null, 0,
  to_jsonb('{"request": "Find it", "at": {"name": "Laptop"}}'::text)), 'and lets it wait for a computer, saying it runs there');
select is((select public.claim_job(id, 'computer:laptop') ->> 'request' from public.agent_jobs where message_id = 'm7'),
  '{"request": "Find it", "at": {"name": "Laptop"}}', 'which that computer claims it with');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}';
select throws_ok($$ select turns from public.agent_jobs $$, '42501', null, 'an account cannot read what its job read so far');
select throws_ok($$ select public.stalled_jobs() $$, '42501', null, 'nor list stalled jobs');
select throws_ok($$ select public.may_continue_agent('00000000-0000-0000-0000-000000000401', 1000) $$, '42501', null, 'nor admit a run');

-- The minute sweep picks up a job whose next run never started, or whose run died, never a device's.
reset role;
update public.agent_jobs set updated_at = now() - interval '1 minute' where message_id in ('m2', 'm4');
set local role service_role;
select results_eq($$ select message_id from public.agent_jobs where id in (select public.stalled_jobs()) $$, $$ values ('m4') $$,
  'the sweep restarts the server''s stalled job and leaves the one a device holds');
select is(public.may_continue_agent('00000000-0000-0000-0000-000000000401', 1000000), 'ok', 'a trial account''s job goes on without counting a reply');

-- Expiry: open after 24 hours fails without its request; ended a week ago goes.
select public.create_job('00000000-0000-0000-0000-000000000401', 'handoff', 'atlas', 'agent:atlas', 'm3', '{"request": "Old"}');
-- A reply paused for files whose device went away, and one whose device may still come back.
select public.release_job((public.claim_job(public.create_job('00000000-0000-0000-0000-000000000401', 'reply', 'atlas', 'agent:atlas', 'm5', '{}'),
  'server:run-10') ->> 'id')::uuid, 'server:run-10', 'device:nonce-2');
select public.release_job((public.claim_job(public.create_job('00000000-0000-0000-0000-000000000401', 'reply', 'atlas', 'agent:atlas', 'm6', '{}'),
  'server:run-11') ->> 'id')::uuid, 'server:run-11', 'device:nonce-3');
reset role;
update public.agent_jobs set expires_at = now() - interval '1 minute' where message_id = 'm3';
update public.agent_jobs set ended_at = now() - interval '8 days' where message_id = 'm1';
update public.agent_jobs set updated_at = now() - interval '7 minutes' where message_id = 'm5';
set local role service_role;
select lives_ok($$ select public.expire_jobs() $$, 'the expiry runs');
select results_eq($$ select state, request from public.agent_jobs where message_id = 'm3' $$, $$ values ('failed', null::jsonb) $$,
  'a job open past 24 hours fails and drops its request');
select is((select count(*) from public.agent_jobs where message_id = 'm1')::int, 0, 'a job ended a week ago is gone');
select results_eq($$ select message_id, state from public.agent_jobs where message_id in ('m5', 'm6') order by message_id $$,
  $$ values ('m5', 'failed'), ('m6', 'waiting') $$, 'a job waiting for a device past its resume window fails; a fresh one waits');
select is((select error from public.agent_jobs where message_id = 'm5'), 'The device that asked didn''t come back with its files. Ask again.',
  'and says why');
select ok(public.finish_job((select id from public.agent_jobs where message_id = 'm4'), 'server:run-9', 'done') is false, 'only the holder ends it');
select * from finish();
rollback;
