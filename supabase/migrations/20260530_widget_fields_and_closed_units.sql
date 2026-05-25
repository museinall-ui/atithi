-- Pre-flip closure for fields the app writes locally but didn't have
-- cloud columns for. Without this migration, the moment DEMO_MODE
-- flips off these would silently disappear on the next sign-in:
--
--   properties.short_code         — slug for /book/<slug> widget URL
--                                   (also used by the iframe + button
--                                   embed snippets in Settings)
--   properties.embed_button       — {text, style, size, useCustomColour,
--                                    color} that drives the styled-button
--                                    snippet customiser
--   properties.arrivals_recipients — array of {id, label, phone} that
--                                    receive the Dashboard's
--                                    "Send tomorrow's arrivals" digest
--   rate_overrides.closed_units    — array of unit indices closed out for
--                                    maintenance on a specific date.
--                                    Drives the F3 per-unit close-out
--                                    that Rates.jsx, NewBooking.jsx, and
--                                    the public widget all already read.
--
-- All statements are `add column if not exists` so re-running on a
-- partially-migrated environment is safe.

alter table properties
  add column if not exists short_code text default '';

alter table properties
  add column if not exists embed_button jsonb not null default '{}'::jsonb;

alter table properties
  add column if not exists arrivals_recipients jsonb not null default '[]'::jsonb;

alter table rate_overrides
  add column if not exists closed_units jsonb not null default '[]'::jsonb;
