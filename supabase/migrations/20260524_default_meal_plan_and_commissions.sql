-- Property settings added in the May 2026 Rates + meal-plan pass.
--
-- 1. default_meal_plan_id — the meal plan the calendar rate is treated
--    as already including. Switching to another plan on a booking adds
--    (or subtracts) the per-guest-per-night delta. Defaults to 'ep' so
--    existing rows behave the same as before (add meals on top).
--
-- 2. channel_commissions — per-OTA commission % the hotelier loses on
--    each booking. Powers the "Take-home · after tax + OTA" card in
--    Reports. Hoteliers override the seeded defaults to match their
--    actual OTA contract.
--
-- Both statements are `add column if not exists` so re-running the file
-- on a partially-migrated environment is safe.

alter table properties
  add column if not exists default_meal_plan_id text default 'ep';

alter table properties
  add column if not exists channel_commissions jsonb default
    '{"direct": 0, "mmt": 18, "goibibo": 15, "booking": 15, "agoda": 18, "airbnb": 3}'::jsonb;
