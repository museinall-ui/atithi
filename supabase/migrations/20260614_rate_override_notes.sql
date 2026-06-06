-- ----------------------------------------------------------------------------
-- 20260614_rate_override_notes.sql
-- Per-date notes on the Rates calendar.
--
-- Adds rate_overrides.note so a hotelier can attach a short, team-only
-- reminder to any date + room-type cell on the rate calendar, e.g.
--   "Diwali - keep rates high"
--   "Owner blocked for family"
--   "Group hold till Friday - don't oversell"
-- Guests never see this; it's private context for the hotelier + staff.
--
-- The app already works WITHOUT this column: notes live in localStorage
-- and the cloud writer (setRateOverrideCloud) retries without `note` if
-- the column is missing. Pasting this migration just lets notes sync to
-- the cloud + across devices.
--
-- Idempotent. Safe to re-run. Paste into Supabase SQL Editor.
-- ----------------------------------------------------------------------------

alter table rate_overrides
  add column if not exists note text not null default '';
