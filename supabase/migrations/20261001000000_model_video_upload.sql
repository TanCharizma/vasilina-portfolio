-- Direct uploads for approved model portfolio clips.
-- Public playback uses the object URL; only the portfolio owner may upload.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'model-videos', 'model-videos', true, 52428800,
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owner uploads model videos" on storage.objects;
create policy "Owner uploads model videos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'model-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.model_portfolios p
    where p.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owner lists model videos" on storage.objects;
create policy "Owner lists model videos"
on storage.objects for select to authenticated
using (
  bucket_id = 'model-videos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
