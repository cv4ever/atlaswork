-- Durable Routine admission: authorization, receipt ordering, stale writes, account isolation and rollback.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000101'), ('00000000-0000-0000-0000-000000000102');

set local role anon;
select throws_ok($$ select public.claim_routine('r', '2026-11-11T08:00:00Z') $$, '42501', null, 'signed-out callers cannot claim a Routine');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated","is_anonymous":true}';
select throws_ok($$ select public.claim_routine('r', '2026-11-11T08:00:00Z') $$, '42501', null, 'anonymous accounts cannot claim a Routine');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}';
select is(public.claim_routine('r', '2026-11-11T08:00:00Z')->'claimed', 'true'::jsonb, 'the first claimant owns the occurrence');
select is(public.claim_routine('r', '2026-11-11T08:00:00Z')->'claimed', 'false'::jsonb, 'the same occurrence cannot be claimed twice');
select is(public.claim_routine('r', '2026-11-10T08:00:00Z')->'claimed', 'false'::jsonb, 'an older occurrence cannot replace the receipt');
select is(public.claim_routine('r', '2026-11-12T08:00:00Z')->'claimed', 'true'::jsonb, 'a later occurrence can run');
select is(public.claim_routine('other', '2026-11-11T08:00:00Z')->'claimed', 'true'::jsonb, 'another Routine has its own receipt');
select public.save_workspace('{"routineRuns":{"r":"2026-11-11T08:00:00.000Z"}}', '{}');
select is(public.load_workspace()->'routineRuns'->>'r', '2026-11-12T08:00:00.000Z', 'a stale save preserves a newer receipt');
select is(public.load_workspace()->'routineRuns'->>'other', '2026-11-11T08:00:00.000Z', 'a stale save preserves other Routine receipts');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}';
select is(public.claim_routine('r', '2026-11-11T08:00:00Z')->'claimed', 'true'::jsonb, 'accounts claim independently');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}';
select is(public.load_workspace()->'routineRuns'->>'r', '2026-11-12T08:00:00.000Z', 'another account cannot change the receipt');
select throws_ok($$ select public.claim_routine('', '2026-11-11T08:00:00Z') $$, '22023', null, 'a claim needs a Routine id');
select throws_ok($$ select public.claim_routine('r', 'infinity') $$, '22023', null, 'an infinite receipt cannot block all future occurrences');
select throws_ok($$ select public.claim_routine('r', null) $$, '22023', null, 'a claim needs a due time');
select throws_ok($$ select public.merge_routine_runs('{}', '{}') $$, '42501', null, 'the internal merge cannot be called directly');

-- Simulate an account over quota without letting its claim bypass the ordinary write's refusal.
reset role;
insert into public.workspace_records (user_id, key, value)
  select '00000000-0000-0000-0000-000000000101', 'note:quota-' || n, to_jsonb(repeat('x', 999000)) from generate_series(1, 26) n;
set local role authenticated;
select throws_ok($$ select public.claim_routine('expensive', '2026-11-11T08:00:00Z') $$, '53400', null, 'a claim respects the Workspace quota');
select ok(not (public.load_workspace()->'routineRuns' ? 'expensive'), 'a refused claim leaves no receipt');
select * from finish();
rollback;
