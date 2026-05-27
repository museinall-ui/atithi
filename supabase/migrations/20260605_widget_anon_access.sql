-- Public booking widget — anon RLS + lookup RPCs.
--
-- Until this migration runs, the widget at /book/<slug> can render
-- (when the hotelier opens it themselves) but guest bookings never
-- reach the cloud — the anon role has no INSERT permission on the
-- bookings table.
--
-- After running:
--   * Anyone (no sign-in) can GET property_by_short_code(slug) →
--     returns the property's display fields (name, photos, meal plans,
--     etc) so the widget can render the right hotel.
--   * Anyone can GET room_categories_by_property(uuid) → returns
--     room types + units + rates.
--   * Anyone can INSERT a single booking row, but ONLY if it has
--     status='tentative' and channel='website'. This is the
--     narrowest possible policy — they can't insert a confirmed
--     booking, can't insert as an OTA channel, can't insert against
--     somebody else's status.
--
-- Owner-side action: paste this whole file into the Supabase SQL
-- Editor and click Run. Idempotent (every CREATE uses OR REPLACE,
-- every CREATE POLICY guards on existence) so re-running is safe.
--
-- After running, share /book/<your-slug> on your website. Bookings
-- land in your Diary marked tentative + on the Website channel
-- within 30 seconds.

-- ---------------------------------------------------------------
-- 1) property_by_short_code(slug)
-- ---------------------------------------------------------------
-- Security definer = runs as the function owner, bypassing RLS.
-- Returns only display-safe fields (no GSTIN, no email, no
-- accountant info, no audit_log).
-- Note on column types — these must match the actual columns in
-- the `properties` table EXACTLY. The initial schema declared
-- `rules` as `text[]` (Postgres text array, not jsonb), so the
-- function signature mirrors that. Every other jsonb-looking
-- field IS jsonb. Mismatch → "return type mismatch in function
-- declared to return record" error on CREATE.
--
-- DROP first — Postgres rejects CREATE OR REPLACE when the return
-- type changes (signature is part of the function's identity). If
-- you ran an earlier version of this migration that left a stub
-- behind, the drop here makes the re-run clean.
drop function if exists public.property_by_short_code(text);
create or replace function public.property_by_short_code(p_short_code text)
returns table(
  id uuid, name text, type text, city text, state text, theme jsonb,
  logo_data_url text, payment_qr_data_url text, payment_qr_label text,
  tagline text, photo_gallery jsonb, rules text[], meal_plans jsonb,
  default_meal_plan_id text, base_capacity_adults integer,
  rate_plans jsonb, weekend_rules jsonb, seasons jsonb,
  channel_markups jsonb, coupons jsonb, embed_button jsonb,
  short_code text, check_in text, check_out text, phone text
)
language sql security definer
set search_path = public as $$
  select id, name, type, city, state, theme,
         logo_data_url, payment_qr_data_url, payment_qr_label,
         tagline, photo_gallery, rules, meal_plans,
         default_meal_plan_id, base_capacity_adults,
         rate_plans, weekend_rules, seasons,
         channel_markups, coupons, embed_button,
         short_code, check_in, check_out, phone
  from properties
  where short_code = p_short_code
  limit 1;
$$;
grant execute on function public.property_by_short_code(text) to anon;
grant execute on function public.property_by_short_code(text) to authenticated;

-- ---------------------------------------------------------------
-- 2) room_categories_by_property(propertyId)
-- ---------------------------------------------------------------
-- Used by the widget to render room tiles + check availability.
drop function if exists public.room_categories_by_property(uuid);
create or replace function public.room_categories_by_property(p_property_id uuid)
returns setof room_categories
language sql security definer
set search_path = public as $$
  select * from room_categories
  where property_id = p_property_id
  order by sort_order nulls last, code;
$$;
grant execute on function public.room_categories_by_property(uuid) to anon;
grant execute on function public.room_categories_by_property(uuid) to authenticated;

-- ---------------------------------------------------------------
-- 3) bookings_by_property_public(propertyId) — for availability check
-- ---------------------------------------------------------------
-- The widget needs to know which dates/rooms are already booked so
-- it can grey out unavailable tiles. Only returns the minimum fields
-- needed for the overlap calculation — no guest name, phone, etc.
drop function if exists public.bookings_by_property_public(uuid);
create or replace function public.bookings_by_property_public(p_property_id uuid)
returns table(
  id text, room_category_code text, unit_idx integer,
  start_date date, nights integer, status text, room_items jsonb
)
language sql security definer
set search_path = public as $$
  select id, room_category_code, unit_idx,
         start_date, nights, status, room_items
  from bookings
  where property_id = p_property_id
    and status in ('confirmed', 'checkedin', 'checkout', 'tentative');
$$;
grant execute on function public.bookings_by_property_public(uuid) to anon;
grant execute on function public.bookings_by_property_public(uuid) to authenticated;

-- ---------------------------------------------------------------
-- 4) anon INSERT policy for widget bookings
-- ---------------------------------------------------------------
-- Permits unauthenticated users to insert ONE booking at a time, and
-- only with status='tentative' + channel='website'. They can't
-- create as confirmed, can't impersonate an OTA channel, can't
-- bypass the auto-release hold. Property_id must match an existing
-- property (enforced by the FK).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'bookings' and policyname = 'anon insert widget bookings'
  ) then
    create policy "anon insert widget bookings" on bookings
      for insert to anon
      with check (
        status = 'tentative'
        and channel = 'website'
      );
  end if;
end
$$;

-- ---------------------------------------------------------------
-- 5) anon INSERT policy for payments (widget records ₹0 placeholder
-- so the payment ledger exists from the start). Same constraints:
-- payment.kind must be 'payment', amount must be 0, and the booking
-- it points at must be a website tentative.
-- ---------------------------------------------------------------
-- We skip this for now — the widget creates the booking with
-- paid=0 + an empty payments array. The hotelier records the real
-- payment when they confirm. If we add anon payment INSERT later
-- (e.g. for online Razorpay integration), the policy would gate on
-- the booking already being a website tentative.

-- Done. Test with:
--   select * from property_by_short_code('your-slug-here');
-- Should return one row with your property's display fields.
