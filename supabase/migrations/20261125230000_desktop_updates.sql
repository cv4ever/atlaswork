-- The desktop app's updates (agents-design D85): a public bucket the app reads `latest.json` from, with the installer
-- it names and `published.json` (which version, built from which commit) for the release plan. Anyone may download
-- them, as from any download page; there are no policies on storage.objects for it, so only the service role (the
-- release, through the Supabase CLI) writes. An installer is at most 50 MB, the free plan's file limit.
insert into storage.buckets (id, name, public, file_size_limit)
values ('desktop', 'desktop', true, 52428800)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;
