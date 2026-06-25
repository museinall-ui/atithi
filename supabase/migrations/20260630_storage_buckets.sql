-- Supabase Storage buckets for property media — moves images (and voice notes)
-- out of base64-in-a-database-row and into proper file storage served by the
-- CDN. Keeps the database tiny and makes images load faster for guests.
--
-- Two buckets:
--   • property-media  (PUBLIC)  — guest-visible images: logo, payment QR, room
--                                 photos, gallery. Anyone with the URL can view
--                                 (they already appear on the public booking
--                                 widget + voucher), but only a signed-in member
--                                 of the property can upload/replace/delete.
--   • property-audio  (PRIVATE) — internal voice notes. Members-only for every
--                                 operation; no public URL — playback uses a
--                                 short-lived signed URL.
--
-- Path convention for BOTH buckets: "<property_uuid>/<file>". The first folder
-- segment is the property id; RLS checks it via has_property_access().
--
-- NOTE: RLS is already enabled on storage.objects by Supabase — we only add
-- policies (do NOT run `alter table storage.objects enable row level security`;
-- you don't own that table from the SQL editor and it will error).
--
-- Idempotent — safe to re-run.

-- ============================================================================
-- PUBLIC bucket: property-media (5 MB cap, image mime types)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-media',
  'property-media',
  true,
  5242880,
  array['image/png','image/jpeg','image/jpg','image/webp','image/gif','image/svg+xml']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Read: anyone (public bucket / CDN).
drop policy if exists "property-media public read" on storage.objects;
create policy "property-media public read"
on storage.objects for select to public
using ( bucket_id = 'property-media' );

-- Insert (upload): a signed-in member of the property in path segment 1.
drop policy if exists "property-media member insert" on storage.objects;
create policy "property-media member insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'property-media'
  and has_property_access( ((storage.foldername(name))[1])::uuid )
);

-- Update (needed for upsert overwrites): member-gated on old + new row.
drop policy if exists "property-media member update" on storage.objects;
create policy "property-media member update"
on storage.objects for update to authenticated
using (
  bucket_id = 'property-media'
  and has_property_access( ((storage.foldername(name))[1])::uuid )
)
with check (
  bucket_id = 'property-media'
  and has_property_access( ((storage.foldername(name))[1])::uuid )
);

-- Delete: member only.
drop policy if exists "property-media member delete" on storage.objects;
create policy "property-media member delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'property-media'
  and has_property_access( ((storage.foldername(name))[1])::uuid )
);

-- ============================================================================
-- PRIVATE bucket: property-audio (10 MB cap, audio mime types)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-audio',
  'property-audio',
  false,
  10485760,
  array['audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/wav','audio/x-m4a']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Members-only for every operation (no public read). One FOR ALL policy: `using`
-- gates read/delete/update-old-row, `with check` gates insert/update-new-row.
drop policy if exists "property-audio member all" on storage.objects;
create policy "property-audio member all"
on storage.objects for all to authenticated
using (
  bucket_id = 'property-audio'
  and has_property_access( ((storage.foldername(name))[1])::uuid )
)
with check (
  bucket_id = 'property-audio'
  and has_property_access( ((storage.foldername(name))[1])::uuid )
);
