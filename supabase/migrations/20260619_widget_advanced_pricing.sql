-- ----------------------------------------------------------------------------
-- 20260619_widget_advanced_pricing.sql
-- Expose Advanced-settings pricing config to the public booking widget so
-- ONLINE guests get the same rules reception does:
--   * Minimum-night stays (accountant.minNights)
--   * Single-occupancy rate (accountant.singleRates + singleOccEnabled)
--   * "Multiple rate plans" master toggle (accountant.ratePlansEnabled) — so a
--     hotelier who turned rate plans OFF doesn't have the picker shown to guests
--     on the widget (which would let them book a disabled-plan price).
--
-- Re-creates property_by_short_code with ONE extra return column,
-- advanced_pricing (jsonb), built from only those three accountant sub-keys —
-- the rest of the accountant blob (CA email/name/firm, etc.) stays private.
--
-- Degrades gracefully: if this isn't pasted, advanced_pricing is absent and
-- the widget simply doesn't enforce min-nights / single-occ (its prior
-- behaviour). Idempotent (drop + create). Paste before sharing the public link.
-- ----------------------------------------------------------------------------

drop function if exists public.property_by_short_code(text);
create or replace function public.property_by_short_code(p_short_code text)
returns table(
  id uuid, name text, type text, city text, state text, theme jsonb,
  logo_data_url text, payment_qr_data_url text, payment_qr_label text,
  tagline text, photo_gallery jsonb, rules text[], meal_plans jsonb,
  default_meal_plan_id text, base_capacity_adults integer,
  rate_plans jsonb, weekend_rules jsonb, seasons jsonb,
  channel_markups jsonb, embed_button jsonb,
  short_code text, check_in text, check_out text, phone text,
  advanced_pricing jsonb
)
language sql security definer
set search_path = public as $$
  select id, name, type, city, state, theme,
         logo_data_url, payment_qr_data_url, payment_qr_label,
         tagline, photo_gallery, rules, meal_plans,
         default_meal_plan_id, base_capacity_adults,
         rate_plans, weekend_rules, seasons,
         channel_markups, embed_button,
         short_code, check_in, check_out, phone,
         jsonb_build_object(
           'minNights',         accountant->'minNights',
           'singleRates',       accountant->'singleRates',
           'singleOccEnabled',  accountant->'singleOccEnabled',
           'ratePlansEnabled',  accountant->'ratePlansEnabled'
         ) as advanced_pricing
  from properties
  where short_code = p_short_code
  limit 1;
$$;
grant execute on function public.property_by_short_code(text) to anon;
grant execute on function public.property_by_short_code(text) to authenticated;
