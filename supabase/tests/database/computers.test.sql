-- Computers (agents-design D77): only a signed-in account registers one, and sees its own without their token hashes;
-- a computer's token claims only that computer's jobs, the server leaves them alone, and removing a computer stops its
-- token at once, fails the work waiting for it and forgets where things are on it (D80).
begin;
create extension if not exists pgtap with schema extensions;
select plan(73);
insert into auth.users (id, invited_at) values ('00000000-0000-0000-0000-000000000501', now()), ('00000000-0000-0000-0000-000000000502', now());
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-000000000503', true);
create temporary table pc (owner text, id uuid, token text);
grant all on pc to public;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select public.register_computer('Office PC') $$, '42501', null, 'signed out, nothing registers a computer');
select throws_ok($$ select name from public.computers $$, '42501', null, 'nor reads them');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000503","role":"authenticated","is_anonymous":true}';
select throws_ok($$ select public.register_computer('Office PC') $$, '42501', null, 'nor does an anonymous user');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}';
insert into pc select 'a', (made ->> 'id')::uuid, made ->> 'token' from (select public.register_computer('  Office PC  ') as made) as r;
select ok((select token like 'awc\_%' and length(token) > 40 from pc where owner = 'a'), 'registering returns the computer''s token once');
select results_eq($$ select name from public.computers $$, $$ values ('Office PC') $$, 'the account lists its computer, its name trimmed');
select throws_ok($$ select token_hash from public.computers $$, '42501', null, 'but never a token''s hash');
select throws_ok($$ update public.computers set name = 'x' $$, '42501', null, 'and changes them only through the functions');
select throws_ok($$ select public.register_computer('   ') $$, '22023', null, 'a computer needs a name');
select throws_ok($$ select public.register_computer('office pc') $$, '23505', 'You already have a computer called office pc. Give this one another name.',
  'a name the account already has, case aside, is refused, saying so (D84, migration 20261125170000_computer_names.sql)');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}';
insert into pc select 'b', (made ->> 'id')::uuid, made ->> 'token' from (select public.register_computer('Laptop') as made) as r;
select results_eq($$ select name from public.computers $$, $$ values ('Laptop') $$, 'another account sees only its own');
select lives_ok($$ select public.register_computer('Office PC') $$, 'and may name one as another account did');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select public.next_computer_job('awc_nobody') $$, '28000', null, 'an unknown token is refused');
select is((select public.next_computer_job(token) from pc where owner = 'a'), null::jsonb, 'a computer with nothing waiting gets nothing');
reset role;
select ok((select last_seen is not null from public.computers where id = (select id from pc where owner = 'a')), 'and is marked as seen');

-- A job for computer A: only A's token claims it, and the server leaves it alone.
set local role service_role;
create temporary table job on commit drop as select public.create_job('00000000-0000-0000-0000-000000000501', 'reply', 'atlas', 'agent:atlas', 'm1',
  '{"request": "Find my taxes"}', 'computer:' || (select id from pc where owner = 'a')) as id;
grant all on job to public;
select is((select public.claim_job(id, 'server:run-1') from job), null::jsonb, 'the server leaves a computer''s job alone');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select public.next_computer_job(token) from pc where owner = 'b'), null::jsonb, 'another account''s computer can''t claim it');
select is((select public.next_computer_job(token) -> 'request' ->> 'request' from pc where owner = 'a'), 'Find my taxes',
  'its computer claims it with what was asked');
select is((select public.next_computer_job(token) from pc where owner = 'a'), null::jsonb, 'once, while it holds it');

-- A helper since D84 asks with computer_poll (migration 20261125170000_computer_names.sql): the same claim, and whether
-- its account has a job open or had one in the last minute, when it asks again in 3 s rather than 10.
select throws_ok($$ select public.computer_poll('awc_nobody') $$, '28000', null, 'the poll refuses an unknown token too');
select is((select public.computer_poll(token) from pc where owner = 'a'), '{"job": null, "busy": true, "search": null}'::jsonb,
  'with nothing to claim while its account has a job open, a computer asks again soon');
select is((select public.computer_poll(token) from pc where owner = 'b'), '{"job": null, "busy": false, "search": null}'::jsonb,
  'and one whose account has none asks every 10 s');

-- Its app version (D85, migration 20261125235000_computer_versions.sql): the poll records it, an older helper's poll
-- without one leaves it, and one that isn't x.y.z is left out.
select is((select public.computer_poll(token, '0.6.1') -> 'busy' from pc where owner = 'b'), 'false'::jsonb, 'a poll may carry the app''s version');
select lives_ok($$ select public.computer_poll(token) from pc where owner = 'b' $$, 'an older helper''s poll, without one, still answers');
select lives_ok($$ select public.computer_poll(token, '0.7; drop') from pc where owner = 'b' $$, 'as does one whose version isn''t one');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}';
select is((select version from public.computers where id = (select id from pc where owner = 'b')), '0.6.1',
  'the account reads the version its poll recorded');
select throws_ok($$ update public.computers set version = '9.9.9' $$, '42501', null, 'and can''t change it');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

-- A tidy (D79, migration 20261125090000_tidy_jobs.sql) waits for its computer too, which claims it with its kind.
set local role service_role;
select lives_ok($$ select public.create_job('00000000-0000-0000-0000-000000000501', 'tidy', 'atlas', 'agent:atlas', 'm7',
  to_jsonb('{"proposal":"p1","undo":false}'::text), 'computer:' || (select id from pc where owner = 'a')) $$, 'a tidy is a job');
select throws_ok($$ select public.create_job('00000000-0000-0000-0000-000000000501', 'delete', 'atlas', 'agent:atlas', 'm8', null, 'server') $$,
  '23514', null, 'of the kinds there are only');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select public.computer_poll(token) #>> '{job,kind}' from pc where owner = 'a'), 'tidy', 'its computer claims it, saying so');

-- Searching every computer (D84, migration 20261125190000_computer_searches.sql): the agent function asks another
-- computer with the service role; only that computer's poll hands the ask over, once and only while it's fresh, and
-- only it answers, once. Nobody else reads or writes the asks, and the job sweep deletes any left behind.
select throws_ok($$ select query from public.computer_searches $$, '42501', null, 'signed out, nobody reads a search ask');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}';
select throws_ok($$ insert into public.computer_searches (user_id, computer_id, query)
  values ('00000000-0000-0000-0000-000000000501', (select id from pc where owner = 'a'), 'x') $$, '42501', null, 'nor does its own account write one');
reset role;
create temporary table asked (id uuid);
grant all on asked to public;
set local role service_role;
select lives_ok($$ with made as (insert into public.computer_searches (user_id, computer_id, query)
  values ('00000000-0000-0000-0000-000000000501', (select id from pc where owner = 'a'), 'banco casa') returning id)
  insert into asked select id from made $$, 'the agent function asks a computer for its part of a search');
insert into public.computer_searches (user_id, computer_id, query, created_at)
  values ('00000000-0000-0000-0000-000000000501', (select id from pc where owner = 'a'), 'stale', now() - interval '30 seconds');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select public.computer_poll(token) #>> '{search,query}' from pc where owner = 'a'), 'banco casa', 'its computer''s poll hands it over');
select is((select public.computer_poll(token) -> 'search' from pc where owner = 'a'), 'null'::jsonb,
  'once, and not one older than its reply would wait for');
select is((select public.answer_search(token, (select id from asked), '{"hits":[]}') from pc where owner = 'b'), false,
  'another account''s computer can''t answer it');
select is((select public.answer_search(token, (select id from asked), '{"hits":[{"path":"Documents/carta.docx"}]}') from pc where owner = 'a'), true,
  'the computer that claimed it answers');
select is((select public.answer_search(token, (select id from asked), '{"hits":[]}') from pc where owner = 'a'), false, 'once');
select throws_ok($$ select public.answer_search('awc_nobody', gen_random_uuid(), '{}') $$, '28000', null, 'and an unknown token answers nothing');
set local role service_role;
select is((select answer #>> '{hits,0,path}' from public.computer_searches where id = (select id from asked)), 'Documents/carta.docx',
  'the agent function reads the answer');
update public.computer_searches set created_at = now() - interval '11 minutes' where id = (select id from asked);
reset role;
select lives_ok($$ select public.expire_jobs() $$, 'the 5-minute job sweep runs');
select is((select count(*) from public.computer_searches where id = (select id from asked))::int, 0, 'and the sweep deletes an ask left behind');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

-- Its helper's asks (migration 20261123220000_computer_jobs.sql): only the agent function resolves a token and counts a
-- call, and a call counts only for the computer holding the job.
select throws_ok($$ select public.computer_of('awc_x') $$, '42501', null, 'a token can''t be resolved by anyone else');
select throws_ok($$ select public.job_call(gen_random_uuid(), 'computer:x') $$, '42501', null, 'nor a call counted');
set local role service_role;
select is((select public.computer_of(token) ->> 'name' from pc where owner = 'a'), 'Office PC', 'the function knows a computer by its token');
select is(public.computer_of('awc_nobody'), null::jsonb, 'and an unknown token as nobody');
select is((select public.job_call(id, 'computer:' || (select id from pc where owner = 'a')) from job), 1, 'its holder counts a call');
select is((select public.job_call(id, 'computer:' || (select id from pc where owner = 'b')) from job), null::integer, 'another computer counts none');

-- Search (D78, migration 20261124090000_computer_search.sql): only its own account turns it on or off, and every device
-- of the account reads it.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}';
select ok(not public.set_computer_search((select id from pc where owner = 'a'), true), 'another account can''t turn on a computer''s search');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000503","role":"authenticated","is_anonymous":true}';
select throws_ok($$ select public.set_computer_search(gen_random_uuid(), true) $$, '42501', null, 'nor can an anonymous user');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}';
select results_eq($$ select search from public.computers $$, $$ values (false) $$, 'a computer starts not searching');
select ok(public.set_computer_search((select id from pc where owner = 'a'), true), 'its account turns search on');
select results_eq($$ select search from public.computers $$, $$ values (true) $$, 'and the account reads that it searches');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select public.set_computer_search(gen_random_uuid(), true) $$, '42501', null, 'and signed out, nobody can');

-- Tidying (D79, migration 20261124120000_computer_tidy.sql): only its own account turns it on, only while search is on
-- there, and search off takes it along.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}';
select ok(not public.set_computer_tidy((select id from pc where owner = 'a'), true), 'another account can''t turn on a computer''s tidying');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000503","role":"authenticated","is_anonymous":true}';
select throws_ok($$ select public.set_computer_tidy(gen_random_uuid(), true) $$, '42501', null, 'nor can an anonymous user');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}';
select results_eq($$ select tidy from public.computers $$, $$ values (false) $$, 'a computer starts not tidying');
select ok(public.set_computer_search((select id from pc where owner = 'a'), false), 'with its search off');
select throws_ok($$ select public.set_computer_tidy((select id from pc where owner = 'a'), true) $$, '22023', 'Turn on search on that computer first.',
  'tidying can''t be turned on');
select ok(public.set_computer_search((select id from pc where owner = 'a'), true), 'with search on again');
select ok(public.set_computer_tidy((select id from pc where owner = 'a'), true), 'its account turns tidying on');
select results_eq($$ select search, tidy from public.computers $$, $$ values (true, true) $$, 'and the account reads that it tidies');
select ok(public.set_computer_search((select id from pc where owner = 'a'), false), 'search off');
select results_eq($$ select search, tidy from public.computers $$, $$ values (false, false) $$, 'takes tidying with it');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select public.set_computer_tidy(gen_random_uuid(), true) $$, '42501', null, 'and signed out, nobody can');

-- Removing: only your own; its token stops, its waiting work fails, and what agents learned there is forgotten (D80,
-- migration 20261125150000_remove_computer_forgets.sql): its memories go, the pills naming it say so, and memories of
-- your own words that mention it, or ones learned on another computer, stay.
reset role;
insert into public.workspace_records (user_id, key, value) select '00000000-0000-0000-0000-000000000501', item.key, item.value from (values
  ('memory:kept', jsonb_build_object('id', 'kept', 'text', 'Banco Lusitano letters: Documents\Bank on Office PC', 'quote', '',
    'computer', jsonb_build_object('id', (select id from pc where owner = 'a'), 'name', 'Office PC'))),
  ('memory:said', '{"id": "said", "text": "The Office PC is in the study", "quote": "my Office PC is in the study"}'::jsonb),
  ('memory:elsewhere', '{"id": "elsewhere", "text": "Photos: Pictures on Laptop", "quote": "", "computer": {"id": "laptop", "name": "Laptop"}}'::jsonb),
  ('message:t1:r1', jsonb_build_object('thread', 't1', 'n', 1, 'message', jsonb_build_object('id', 'r1', 'text', 'In Documents\Bank.', 'learned', jsonb_build_array(
    jsonb_build_object('state', 'offered', 'memory', jsonb_build_object('id', 'offer', 'text', 'Receipts: Documents\Health on Office PC',
      'computer', jsonb_build_object('id', (select id from pc where owner = 'a'), 'name', 'Office PC'))),
    jsonb_build_object('state', 'kept', 'memory', jsonb_build_object('id', 'kept', 'text', 'Banco Lusitano letters: Documents\Bank on Office PC',
      'computer', jsonb_build_object('id', (select id from pc where owner = 'a'), 'name', 'Office PC')),
      'replaced', jsonb_build_object('id', 'kept', 'text', 'Banco Lusitano letters: Documents on Office PC')),
    '{"state": "offered", "memory": {"id": "photos", "text": "Photos: Pictures on Laptop", "computer": {"id": "laptop", "name": "Laptop"}}}'::jsonb))))
) as item (key, value);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}';
select ok(not public.remove_computer((select id from pc where owner = 'a')), 'another account can''t remove it');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}';
select ok(public.remove_computer((select id from pc where owner = 'a')), 'its account removes it');
select results_eq($$ select state, error from public.agent_jobs where message_id = 'm1' $$,
  $$ values ('failed', 'That computer was removed, so the work waiting for it stopped.') $$, 'and the work it held fails, saying why');
select results_eq($$ select key from public.workspace_records where key like 'memory:%' order by key $$,
  $$ values ('memory:elsewhere'), ('memory:said') $$, 'a memory learned there is forgotten, one in your words or from elsewhere stays');
select results_eq($$ select entry ->> 'state', entry #>> '{memory,text}', entry ? 'replaced'
    from public.workspace_records, jsonb_array_elements(value #> '{message,learned}') as entry where key = 'message:t1:r1' $$,
  $$ values ('gone', '', false), ('gone', '', false), ('offered', 'Photos: Pictures on Laptop', false) $$,
  'the pills learned there, offered or kept, say it''s gone, without where or what Undo would put back');
select is((select value #>> '{message,text}' from public.workspace_records where key = 'message:t1:r1'), 'In Documents\Bank.', 'the reply itself stays');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select public.next_computer_job((select token from pc where owner = 'a')) $$, '28000', null, 'its token stops at once');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}';
select lives_ok($$ select public.register_computer('PC ' || n) from generate_series(1, 10) as n $$, 'an account registers up to ten');
select throws_ok($$ select public.register_computer('PC 11') $$, '53400', null, 'and no more');
select * from finish();
rollback;
