-- Each computer's app version (agents-design D85): the app hands its version to its helper, whose poll records it on
-- the computer's row, so Settings -> Computers shows it and the release plan counts the computers behind the published
-- one. Only the poll writes it; the account reads it with the rest of its computers. A helper from before this sends
-- no version and leaves it null, and a version that isn't x.y.z is left out rather than stored.
alter table public.computers add column version text check (version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$');
grant select (version) on public.computers to authenticated;

-- A new argument with a default: PostgREST calls from older helpers, with p_token alone, still resolve to it.
drop function public.computer_poll(text);
create function public.computer_poll(p_token text, p_version text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  job jsonb := public.next_computer_job(p_token);
  computer uuid;
  owner uuid;
  asked uuid;
  words text;
begin
  select id, user_id into computer, owner from public.computers
    where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  update public.computers set version = p_version
    where id = computer and p_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,6}$' and version is distinct from p_version;
  update public.computer_searches set claimed_at = now()
    where id = (select s.id from public.computer_searches s where s.computer_id = computer and s.claimed_at is null
      and s.created_at > now() - interval '20 seconds' order by s.created_at limit 1 for update skip locked)
    returning id, computer_searches.query into asked, words;
  return jsonb_build_object('job', job, 'busy', exists (select 1 from public.agent_jobs where user_id = owner
      and (state in ('waiting', 'running') or created_at > now() - interval '1 minute' or ended_at > now() - interval '1 minute')),
    'search', case when asked is null then null else jsonb_build_object('id', asked, 'query', words) end);
end;
$$;
revoke execute on function public.computer_poll from public, anon, authenticated;
grant execute on function public.computer_poll to anon, authenticated;
