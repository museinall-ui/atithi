-- ----------------------------------------------------------------------------
-- 20260615_widget_rate_overrides.sql
-- Public booking widget — honour the rate calendar.
--
-- Adds rate_overrides_by_property(uuid): an anon-readable, SECURITY DEFINER
-- function that returns the per-date rate overrides + close-outs for a
-- property so the public /book/<slug> widget quotes the SAME price the
-- hotelier set on the Rates calendar, and refuses to sell dates / units
-- the hotelier blocked.
--
-- Deliberately returns ONLY the pricing + availability fields the widget
-- needs (room_category_code, date, rate, closed_out, closed_units). It does
-- NOT return the `note` column — per-date notes are private, team-only
-- reminders and must never reach a guest.
--
-- The app degrades gracefully without this: if the RPC is missing the
-- widget just quotes base + weekend/season rates (its prior behaviour) and
-- cannot see close-outs. Pasting this turns on full calendar parity.
--
-- Idempotent. Safe to re-run. Paste into Supabase SQL Editor.
-- ----------------------------------------------------------------------------

drop function if exists public.rate_overrides_by_property(uuid);
create or replace function public.rate_overrides_by_property(p_property_id uuid)
returns table(
  room_category_code text, date date, rate integer,
  closed_out boolean, closed_units jsonb
)
language sql security definer
set search_path = public as $$
  select room_category_code, date, rate, closed_out, closed_units
  from rate_overrides
  where property_id = p_property_id;
$$;
grant execute on function public.rate_overrides_by_property(uuid) to anon;
grant execute on function public.rate_overrides_by_property(uuid) to authenticated;

-- Test with:
--   select * from rate_overrides_by_property('<your-property-uuid>');
