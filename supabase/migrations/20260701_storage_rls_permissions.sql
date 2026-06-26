-- Tighten Storage RLS to match the app's RBAC.
--
-- The original 20260630 bucket policies gated property-media writes (and
-- property-audio reads+writes) on bare MEMBERSHIP (has_property_access). But:
--   • property media (logo / payment-QR / room photos / gallery) is part of the
--     property PROFILE, which everywhere else requires `manage_settings`
--     (properties UPDATE RLS in 20260611, and the Settings UI edit gate). So a
--     low-trust member (e.g. reception, who lacks manage_settings) — blocked in
--     the UI and at the properties table — could still call
--     supabase.storage.from('property-media').remove([...]) / .upload(...)
--     directly to deface or delete the hotel's public images.
--   • voice notes (property-audio) are an `edit_bookings` action (the recorder is
--     gated on the booking-edit permission), not a bare-membership one.
--
-- This aligns storage.objects with the per-table RBAC that 20260611 established.
-- has_perm() owner-short-circuits, so the owner always keeps full access.
-- Public READ of property-media is unchanged (guests still load images).
-- Idempotent — safe to re-run.

-- ── property-media (PUBLIC images): writes require manage_settings ───────────
drop policy if exists "property-media member insert" on storage.objects;
create policy "property-media member insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'property-media'
  and has_perm(((storage.foldername(name))[1])::uuid, 'manage_settings')
);

drop policy if exists "property-media member update" on storage.objects;
create policy "property-media member update" on storage.objects for update to authenticated
using (
  bucket_id = 'property-media'
  and has_perm(((storage.foldername(name))[1])::uuid, 'manage_settings')
)
with check (
  bucket_id = 'property-media'
  and has_perm(((storage.foldername(name))[1])::uuid, 'manage_settings')
);

drop policy if exists "property-media member delete" on storage.objects;
create policy "property-media member delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'property-media'
  and has_perm(((storage.foldername(name))[1])::uuid, 'manage_settings')
);
-- (the "property-media public read" SELECT policy from 20260630 is unchanged.)

-- ── property-audio (PRIVATE voice notes): read = member, write = edit_bookings ─
-- Replace the single FOR-ALL membership policy with split read/write so any
-- member can play a note but only an edit_bookings member can add/remove one
-- (matching the BookingDetail recorder gate).
drop policy if exists "property-audio member all" on storage.objects;

drop policy if exists "property-audio member read" on storage.objects;
create policy "property-audio member read" on storage.objects for select to authenticated
using (
  bucket_id = 'property-audio'
  and has_property_access(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "property-audio member insert" on storage.objects;
create policy "property-audio member insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'property-audio'
  and has_perm(((storage.foldername(name))[1])::uuid, 'edit_bookings')
);

drop policy if exists "property-audio member update" on storage.objects;
create policy "property-audio member update" on storage.objects for update to authenticated
using ( bucket_id = 'property-audio' and has_perm(((storage.foldername(name))[1])::uuid, 'edit_bookings') )
with check ( bucket_id = 'property-audio' and has_perm(((storage.foldername(name))[1])::uuid, 'edit_bookings') );

drop policy if exists "property-audio member delete" on storage.objects;
create policy "property-audio member delete" on storage.objects for delete to authenticated
using ( bucket_id = 'property-audio' and has_perm(((storage.foldername(name))[1])::uuid, 'edit_bookings') );
