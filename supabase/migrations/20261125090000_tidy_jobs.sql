-- Tidying on a computer (agents-design D79): Apply and Undo of an approved tidy are jobs too, of kind `tidy`, waiting
-- for that computer (`computer:<id>`). Its helper claims one like a reply (`next_computer_job`) and its app makes the
-- moves; the request names the proposal, and on Apply its moves.
alter table public.agent_jobs drop constraint agent_jobs_kind_check;
alter table public.agent_jobs add constraint agent_jobs_kind_check check (kind in ('reply', 'handoff', 'tidy'));
