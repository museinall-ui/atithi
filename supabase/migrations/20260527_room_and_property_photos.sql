-- Photos + tagline for the public booking widget. Customer-facing —
-- guests book on visuals as much as price, so we surface a hero image
-- per room category, a gallery for the property as a whole, and a
-- one-line pitch for the brand header.
--
--   room_categories.photo_data_url — single hero image per category,
--     base64 data URL. Renders on each room tile in the widget and on
--     the voucher inside the rooms-reserved card.
--
--   properties.photo_gallery — jsonb array of 0..5 data URLs. Renders
--     as a horizontal scroller on the widget's Step 1 (the landing
--     page guests see first).
--
--   properties.tagline — short property pitch (max ~140 chars).
--     Shown under the property name on the widget header.
--
-- Photos stored inline as base64 for now — matches the logo + payment
-- QR pattern already in use. The cap is enforced in the upload UI
-- (2 MB per image) because the row total still has to fit Postgres
-- column limits + localStorage when DEMO_MODE is on. The Phase 4
-- migration to Supabase Storage will move these to object URLs and
-- lift the cap entirely.
--
-- Idempotent — safe to re-run.

alter table room_categories
  add column if not exists photo_data_url text;

alter table properties
  add column if not exists photo_gallery jsonb not null default '[]'::jsonb;

alter table properties
  add column if not exists tagline text default '';
