-- Chat messages one record each (agents-design D76): a reply the server lands and a message written meanwhile both
-- stay, reads get whole threads in the order messages were written, a thread an older app writes whole becomes
-- records without dropping anyone else's, a deleted thread takes its messages, and nobody calls the split directly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000301'), ('00000000-0000-0000-0000-000000000302');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}';
select lives_ok($$ select public.save_workspace('{"initialized": true, "thread:agent:atlas": {"id": "agent:atlas", "read": 1, "attachedNoteId": null},
  "message:agent:atlas:u1": {"thread": "agent:atlas", "n": 0, "message": {"id": "u1", "role": "user", "text": "Plan my week", "awaiting": ["atlas"], "at": "2026-11-23T10:00:00Z"}}}', '{}') $$,
  'the page saves a thread and your message as records');
select throws_ok($$ select public.split_threads('00000000-0000-0000-0000-000000000301', '{thread:agent:atlas}') $$, '42501', null,
  'an account cannot call the split itself');

-- The agent function lands a reply while the page sends another message: each writes only its own message, both at
-- the place after your first one.
set local role service_role;
select lives_ok($$ select public.save_workspace_of('00000000-0000-0000-0000-000000000301',
  '{"message:agent:atlas:a1": {"thread": "agent:atlas", "n": 1, "message": {"id": "a1", "role": "agent", "text": "Here is a plan", "at": "2026-11-23T10:00:20Z"}}}', '{}') $$,
  'the function lands a reply as one record');
set local role authenticated;
select lives_ok($$ select public.save_workspace('{"message:agent:atlas:u2": {"thread": "agent:atlas", "n": 1, "message": {"id": "u2", "role": "user", "text": "And Friday?", "at": "2026-11-23T10:00:10Z"}}}', '{}') $$,
  'the page saves the message written meanwhile');
select is(public.load_workspace() -> 'thread:agent:atlas',
  '{"id": "agent:atlas", "read": 1, "attachedNoteId": null, "messages": [
    {"id": "u1", "role": "user", "text": "Plan my week", "awaiting": ["atlas"], "at": "2026-11-23T10:00:00Z"},
    {"id": "u2", "role": "user", "text": "And Friday?", "at": "2026-11-23T10:00:10Z"},
    {"id": "a1", "role": "agent", "text": "Here is a plan", "at": "2026-11-23T10:00:20Z"}]}'::jsonb,
  'a read gets the whole thread: both stay, by when they were written');
select ok(not exists (select 1 from jsonb_object_keys(public.load_workspace()) as key where key like 'message:%'), 'reads carry no message records');

-- An app from before the change writes the thread whole, without the reply it never saw.
select lives_ok($$ select public.save_workspace('{"thread:agent:atlas": {"id": "agent:atlas", "read": 3, "attachedNoteId": null, "messages": [
  {"id": "u1", "role": "user", "text": "Plan my week", "awaiting": []}, {"id": "u2", "role": "user", "text": "And Friday?"}, {"id": "u3", "role": "user", "text": "Thanks"}]}}', '{}') $$,
  'an older app writes a whole thread');
select is((select array_agg(message ->> 'id') from jsonb_array_elements(public.load_workspace() -> 'thread:agent:atlas' -> 'messages') as message),
  array['u1', 'u2', 'a1', 'u3'], 'its messages become records, and the reply it never saw stays');
reset role;
select is((select value from public.workspace_records where key = 'thread:agent:atlas'), '{"id": "agent:atlas", "read": 3, "attachedNoteId": null}'::jsonb,
  'the stored thread keeps no messages of its own');

-- Deleting the chat takes its messages, and only its own.
set local role authenticated;
select lives_ok($$ select public.save_workspace('{"thread:chat:x": {"id": "chat:x", "read": 0, "attachedNoteId": null},
  "message:chat:x:m": {"thread": "chat:x", "n": 0, "message": {"id": "m", "role": "user", "text": "Hi"}}}', '{thread:agent:atlas}') $$,
  'deleting a thread');
reset role;
select results_eq($$ select key from public.workspace_records where user_id = '00000000-0000-0000-0000-000000000301' and key ~ '^(message|thread):' order by key $$,
  $$ values ('message:chat:x:m'), ('thread:chat:x') $$, 'its messages go with it; another chat keeps its own');
select * from finish();
rollback;
