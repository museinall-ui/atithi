-- Round-trip the booking fields the local app already writes but the
-- bookings table didn't have columns for. Without this migration, the
-- moment DEMO_MODE flips off, every newly-created booking silently loses
-- these four fields on the next page reload:
--
--   meal_plan_id  text — which meal plan the guest is on (EP/CP/MAP/AP
--     or a custom plan). Drives the voucher meal-plan chip and the per-
--     guest-per-night cost delta vs the property's default plan.
--
--   rate_plan_id  text — which rate plan applied at booking time
--     (Standard / Flexible / Non-refundable / custom). The plan's
--     multiplier was baked into `total` at create time; this id is kept
--     so the booking detail can show "booked on Non-refundable" + the
--     cancellation window stays correct.
--
--   email         text — guest email, drives the Email button on the
--     booking detail and the "Email a copy" mailto on the public widget.
--
--   events        jsonb — append-only audit log shipped May 2026.
--     Holds {kind, at, ...} entries for status transitions, hold
--     extensions, moves, etc. Drives the Activity feed.
--
-- All statements are `add column if not exists` so re-running on a
-- partially-migrated environment is safe.

alter table bookings
  add column if not exists meal_plan_id text default 'ep';

alter table bookings
  add column if not exists rate_plan_id text default 'standard';

alter table bookings
  add column if not exists email text default '';

alter table bookings
  add column if not exists events jsonb not null default '[]'::jsonb;
