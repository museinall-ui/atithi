-- Extra-guest pricing model. Shipped May 2026 with the per-category
-- extra-adult / extra-child surcharge UI in Settings → Property profile.
--
-- Three new columns:
--
--   properties.base_capacity_adults — int, default 2. How many adults
--     are included in every room's published rate. Adults above this
--     count are charged the per-category extra-adult surcharge.
--
--   room_categories.extra_adult / extra_child — jsonb. Each holds an
--     object like {"mode":"flat","value":500} or {"mode":"pct","value":25}.
--     'flat' is rupees per extra guest per night; 'pct' is % of the room
--     category's base rate per extra guest per night. NULL = no surcharge
--     (back-compat with the older model that charged a single room rate).
--
-- The two child-age thresholds (free below + half-rate below) ride on
-- the existing `properties.accountant` jsonb (childFreeBelowAge,
-- childAgeBelow) so no schema change is required for those.
--
-- All statements are `add column if not exists` so re-running on a
-- partially-migrated environment is safe.

alter table properties
  add column if not exists base_capacity_adults integer default 2;

alter table room_categories
  add column if not exists extra_adult jsonb;

alter table room_categories
  add column if not exists extra_child jsonb;
