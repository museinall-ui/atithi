-- Public booking widget — atomic capacity check on insert.
--
-- The widget validates availability client-side, then inserts the booking
-- with a plain INSERT (src/cloud/widget.js insertWidgetBooking). That leaves
-- a race: two guests who tap Confirm in the same instant both pass their
-- (independent) client-side checks and both insert, double-booking the same
-- unit — a stacked pill on unit 0 in the hotelier's diary.
--
-- book_widget_slot() closes the race by doing the capacity check AND the
-- insert in one transaction, serialised per (property, room type) with a
-- transaction-scoped advisory lock so two simultaneous Confirms can't both
-- see a free unit. SECURITY DEFINER so the unauthenticated anon role can run
-- it; it forces status='tentative' + channel='website' itself (same
-- constraints as the anon INSERT policy) so it can't be abused to mint
-- confirmed / OTA bookings.
--
-- Scope: this guards against overlapping *real bookings*. Per-day rate
-- overrides / per-unit close-outs (rate_overrides) are NOT factored in here —
-- that table is keyed by a client-relative day index (offset from the app's
-- "today"), which has no stable server-side date mapping. The widget already
-- subtracts closed units client-side; this RPC is the last-line guard against
-- the concurrent-insert race specifically.
--
-- Owner-side action: paste this whole file into the Supabase SQL Editor and
-- click Run. Idempotent (DROP + CREATE OR REPLACE, re-grantable) so re-running
-- is safe. Until it's run the widget keeps working exactly as before — the
-- client calls this RPC first and falls back to the plain INSERT if the
-- function doesn't exist yet.

drop function if exists public.book_widget_slot(jsonb);
create or replace function public.book_widget_slot(p_booking jsonb)
returns text
language plpgsql security definer
set search_path = public as $$
declare
  v_property_id uuid := (p_booking->>'property_id')::uuid;
  v_type        text := p_booking->>'room_category_code';
  v_start       date := (p_booking->>'start_date')::date;
  v_nights      int  := greatest(1, coalesce((p_booking->>'nights')::int, 1));
  v_rooms_needed int;
  v_units       int;
  v_max_blocked int;
  v_new_id      text;
begin
  if v_property_id is null or v_type is null or v_start is null then
    raise exception 'bad_request' using errcode = 'P0001';
  end if;

  -- Rooms this booking needs = number of room_items (a multi-room widget
  -- booking carries one item per room), at least 1. Guard the array check so
  -- a malformed/absent room_items doesn't error the function.
  v_rooms_needed := greatest(1, coalesce(
    case when jsonb_typeof(p_booking->'room_items') = 'array'
         then jsonb_array_length(p_booking->'room_items') end, 1));

  -- Serialise concurrent widget inserts for the same property + room type so
  -- two simultaneous Confirms can't both pass the capacity check. The lock is
  -- transaction-scoped: released automatically when this function's
  -- transaction commits (PostgREST runs each RPC call in its own txn).
  perform pg_advisory_xact_lock(hashtext(v_property_id::text || ':' || coalesce(v_type, '')));

  select units into v_units
  from room_categories
  where property_id = v_property_id and code = v_type;

  if v_units is null then
    raise exception 'unknown_room_type' using errcode = 'P0001';
  end if;

  -- Worst-case occupancy of this room type across the requested nights:
  -- for each night, sum the units taken by overlapping, non-cancelled
  -- bookings (counting per-type room_items, or the single room_category_code
  -- for legacy bookings), then take the max night.
  select coalesce(max(occ.cnt), 0) into v_max_blocked
  from generate_series(0, v_nights - 1) as gs(n)
  cross join lateral (
    select coalesce(sum(
      case
        when jsonb_typeof(b.room_items) = 'array' and jsonb_array_length(b.room_items) > 0 then (
          select count(*) from jsonb_array_elements(b.room_items) ri
          where coalesce(ri->>'roomTypeId', b.room_category_code) = v_type
        )
        when b.room_category_code = v_type then 1
        else 0
      end
    ), 0) as cnt
    from bookings b
    where b.property_id = v_property_id
      and b.status <> 'cancelled'
      and b.start_date <= (v_start + gs.n)
      and (b.start_date + b.nights) > (v_start + gs.n)
  ) occ;

  if v_max_blocked + v_rooms_needed > v_units then
    raise exception 'no_capacity' using errcode = 'P0001';
  end if;

  -- Capacity OK → insert. id (BK-XXXX) is filled by the existing
  -- generate_booking_id trigger. status / channel / paid forced to the
  -- widget's allowed shape regardless of payload.
  insert into bookings (
    property_id, room_category_code, unit_idx, start_date, nights,
    guest_name, phone, email, country, form_c, guests, vip, notes,
    status, channel, total, paid, gst_applies,
    extras, custom_extras, extra_prices, room_items,
    meal_plan_id, rate_plan_id, events, coupon_code, discount_amount,
    release_ts, release_at, hold_hours
  ) values (
    v_property_id,
    v_type,
    coalesce((p_booking->>'unit_idx')::int, 0),
    v_start,
    v_nights,
    coalesce(p_booking->>'guest_name', ''),
    coalesce(p_booking->>'phone', ''),
    coalesce(p_booking->>'email', ''),
    coalesce(p_booking->>'country', 'IN'),
    coalesce((p_booking->>'form_c')::boolean, false),
    coalesce(p_booking->>'guests', ''),
    false,
    coalesce(p_booking->>'notes', ''),
    'tentative',
    'website',
    coalesce((p_booking->>'total')::int, 0),
    0,
    coalesce((p_booking->>'gst_applies')::boolean, false),
    coalesce(p_booking->'extras', '{}'::jsonb),
    coalesce(p_booking->'custom_extras', '[]'::jsonb),
    coalesce(p_booking->'extra_prices', '{}'::jsonb),
    coalesce(p_booking->'room_items', '[]'::jsonb),
    coalesce(p_booking->>'meal_plan_id', 'ep'),
    coalesce(p_booking->>'rate_plan_id', 'standard'),
    coalesce(p_booking->'events', '[]'::jsonb),
    coalesce(p_booking->>'coupon_code', ''),
    coalesce((p_booking->>'discount_amount')::int, 0),
    (p_booking->>'release_ts')::bigint,
    p_booking->>'release_at',
    (p_booking->>'hold_hours')::int
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;
grant execute on function public.book_widget_slot(jsonb) to anon;
grant execute on function public.book_widget_slot(jsonb) to authenticated;

-- Test (replace the uuid / code with a real property + room type):
--   select book_widget_slot(jsonb_build_object(
--     'property_id', '00000000-0000-0000-0000-000000000000',
--     'room_category_code', 'dlx',
--     'start_date', '2026-07-01',
--     'nights', 2,
--     'guest_name', 'Test Guest',
--     'room_items', '[{"roomTypeId":"dlx","adults":2,"children":0}]'::jsonb
--   ));
-- Returns the new BK-XXXX id, or raises 'no_capacity' if the type is full.
