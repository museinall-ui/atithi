-- Public booking widget — per-property flood cap (round-9 R9-5, OPTIONAL).
--
-- The widget RPC (book_widget_slot, from 20260607) inserts a tentative hold
-- with no throttle, so a script could spam a property's diary with hundreds of
-- fake holds. This re-creates the function with ONE extra guard: a cap on how
-- many website holds a single property can receive in a rolling window.
--
-- HONEST TRADE-OFF (read before pasting): this is a CRUDE backstop, not the
-- real fix. The RPC can't see the visitor's IP (it runs server-side behind
-- Supabase's pooler), so the cap is per-PROPERTY, not per-attacker. A flood
-- that fills the cap also blocks legitimate guests until the window rolls over.
-- The cap is set deliberately HIGH (40 / hour) so a normal small hotel will
-- never hit it but an obvious flood is bounded. The REAL fix is a CAPTCHA
-- (Cloudflare Turnstile / hCaptcha) on the booking form, verified inside this
-- RPC — that stops bots without ever blocking a human. See the gist for the
-- recommendation. This migration is optional; skip it if you'd rather wait for
-- the CAPTCHA approach.
--
-- Everything else in this function is byte-for-byte the same as 20260607
-- (advisory lock + per-night capacity check + forced tentative/website insert).
--
-- Owner-side action: optional. Paste into Supabase SQL Editor + Run to enable
-- the cap. Idempotent. Re-paste 20260607 to revert to no cap.

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
  v_recent      int;
  v_new_id      text;
  -- Flood ceiling: max website holds one property accepts per rolling hour.
  -- High enough that real traffic never trips it; low enough to bound a flood.
  c_window_cap  constant int := 40;
begin
  if v_property_id is null or v_type is null or v_start is null then
    raise exception 'bad_request' using errcode = 'P0001';
  end if;

  v_rooms_needed := greatest(1, coalesce(
    case when jsonb_typeof(p_booking->'room_items') = 'array'
         then jsonb_array_length(p_booking->'room_items') end, 1));

  -- R9-5 flood guard: count website holds created for this property in the
  -- trailing hour. Done BEFORE the advisory lock so a flood is rejected cheaply
  -- without serialising. Only website-channel rows count, so a busy reception
  -- taking phone bookings never trips it.
  select count(*) into v_recent
  from bookings
  where property_id = v_property_id
    and channel = 'website'
    and created_at > now() - interval '1 hour';
  if v_recent >= c_window_cap then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- Serialise concurrent widget inserts for the same property + room type.
  perform pg_advisory_xact_lock(hashtext(v_property_id::text || ':' || coalesce(v_type, '')));

  select units into v_units
  from room_categories
  where property_id = v_property_id and code = v_type;

  if v_units is null then
    raise exception 'unknown_room_type' using errcode = 'P0001';
  end if;

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
