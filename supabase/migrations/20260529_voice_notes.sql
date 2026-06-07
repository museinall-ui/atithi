-- Voice notes on bookings. The hotelier can record a short audio
-- snippet ("guest is allergic to peanuts, leaving a note for
-- housekeeping") attached to the booking. Played back from
-- BookingDetail.
--
-- Stored inline as base64 data URLs in a jsonb array. Each note is
-- shape { id, dataUrl, durationSec, createdAt } (camelCase — the app
-- reads/writes these keys verbatim; the column is opaque jsonb, so the
-- casing here is just documentation). Cap is enforced
-- in the upload UI (max 60s per note, max 3 notes per booking) so
-- the row stays under ~600 KB even in worst case. Phase 4 will move
-- these to Supabase Storage and lift the cap entirely.
--
-- Idempotent — safe to re-run.

alter table bookings
  add column if not exists voice_notes jsonb not null default '[]'::jsonb;
