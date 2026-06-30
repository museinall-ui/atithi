-- ----------------------------------------------------------------------------
-- 20260628_widget_unit_allocation.sql
-- Public booking widget — correct unit-index allocation (follow-up to 20260626).
--
-- BUG (2026-06-25 deepest audit): book_widget_slot set the new booking's
-- unit_idx to the occupancy COUNT (v_max_blocked), not the first FREE unit. When
-- existing bookings sit on non-contiguous units (e.g. units 0 and 2 taken, unit 1
-- free), the count (2) was used as the index, landing the website booking on the
-- already-occupied unit 2 and stacking two pills on one unit in the Diary. The
-- capacity check itself is correct (never oversells), so this was a Diary
-- display double-book, not a real oversell.
--
-- FIX: scan units 0..units-1 and pick the LOWEST FREE index for the requested
-- nights (mirroring the app's firstFreeUnit / computeUnitUsage). Everything else
-- is identical to 20260626 (min-stay + coupon validation + capacity + paid=0).
-- Idempotent (DROP + CREATE OR REPLACE); requires 20260610 + 20260606 installed.
--
-- KNOWN LIMITATION (unchanged): the scan matches single-room bookings by their
-- stored unit_idx + maintenance close-outs. A multi-room booking's SECONDARY
-- rooms (room_items without a stored unit_idx) aren't tracked per-unit — same as
-- the rest of the app's Phase-1 multi-room model. Capacity is still enforced
-- correctly above; only the chosen index ignores those secondary rooms.
--
-- Owner-side action: paste into the Supabase SQL Editor + Run before the next
-- public booking. Safe to re-run.
-- ----------------------------------------------------------------------------

drop function if exists public.book_widget_slot(jsonb);
create or replace function public.book_widget_slot(p_booking jsonb)
returns text
language plpgsql security definer
set search_path = public as $$
declare
  v_property_id   uuid := (p_booking->>'property_id')::uuid;
  v_type          text := p_booking->>'room_category_code';
  v_start         date := (p_booking->>'start_date')::date;
  v_nights        int  := greatest(1, coalesce((p_booking->>'nights')::int, 1));
  v_rooms_needed  int;
  v_units         int;
  v_max_blocked   int;
  v_recent        int;
  v_unit          int;
  v_u             int;
  v_total         int  := greatest(0, coalesce((p_booking->>'total')::int, 0));
  v_discount      int  := greatest(0, coalesce((p_booking->>'discount_amount')::int, 0));
  v_subtotal      int;
  v_coupon_code   text := btrim(coalesce(p_booking->>'coupon_code', ''));
  v_store_coupon  text := '';
  v_coupon        jsonb;
  v_disc          jsonb;
  v_coupon_ok     boolean := false;
  v_accountant    jsonb;
  v_weekend_rules jsonb;
  v_weekend_days  int[];
  v_has_weekend   boolean;
  v_min_needed    int;
  v_new_id        text;
  c_window_cap    constant int := 40;  -- max website holds per property per rolling hour
begin
  if v_property_id is null or v_type is null or v_start is null then
    raise exception 'bad_request' using errcode = 'P0001';
  end if;

  -- (1) Date floor — no past-dated holds (yesterday tolerated for TZ edge).
  if v_start < current_date - 1 then
    raise exception 'past_date' using errcode = 'P0001';
  end if;

  -- Load the property's pricing config once (min-stay rule + weekend days).
  select accountant, weekend_rules into v_accountant, v_weekend_rules
  from properties where id = v_property_id;

  -- (A) Minimum-night-stay. The widget UI blocks a too-short stay, but a
  -- hand-crafted RPC call bypassed it. Enforce it server-side too.
  if coalesce((v_accountant->'minNights'->>'enabled')::boolean, false) then
    v_weekend_days := coalesce(
      (select array_agg(x::int)
         from jsonb_array_elements_text(coalesce(v_weekend_rules->'weekendDays', '[0,6]'::jsonb)) x),
      array[0, 6]);
    select bool_or(extract(dow from (v_start + gs.n))::int = any(v_weekend_days))
      into v_has_weekend
      from generate_series(0, v_nights - 1) gs(n);
    v_min_needed := case when coalesce(v_has_weekend, false)
                         then coalesce((v_accountant->'minNights'->>'weekend')::int, 1)
                         else coalesce((v_accountant->'minNights'->>'allDays')::int, 1) end;
    if v_nights < coalesce(v_min_needed, 1) then
      raise exception 'min_stay' using errcode = 'P0001';
    end if;
  end if;

  -- (B) Coupon integrity. Reconstruct the claimed pre-discount subtotal, then
  -- trust ONLY a server-validated coupon and recompute the discount from its own
  -- rule. A fake / invalid coupon (or a discount with no coupon) → zero discount.
  v_subtotal := v_total + v_discount;   -- claimed pre-discount amount
  v_discount := 0;                      -- default: no discount unless a real coupon says so
  if v_coupon_code <> '' then
    v_coupon := validate_coupon(v_property_id, v_coupon_code, v_nights);
    if coalesce((v_coupon->>'ok')::boolean, false) then
      v_disc := v_coupon->'discount';
      if v_disc->>'mode' = 'flat' then
        v_discount := least(greatest(0, coalesce((v_disc->>'value')::int, 0)), v_subtotal);
      elsif v_disc->>'mode' = 'pct' then
        v_discount := round(v_subtotal * greatest(0, coalesce((v_disc->>'value')::numeric, 0)) / 100)::int;
      end if;
      v_discount := least(greatest(0, v_discount), v_subtotal);
      v_store_coupon := coalesce(v_coupon->>'code', v_coupon_code);
      v_coupon_ok := true;
    end if;
    -- invalid coupon → discount stays 0 and no phantom code is stored
  end if;
  v_total := greatest(0, v_subtotal - v_discount);

  v_rooms_needed := greatest(1, coalesce(
    case when jsonb_typeof(p_booking->'room_items') = 'array'
         then jsonb_array_length(p_booking->'room_items') end, 1));

  -- Flood guard (20260612): bound website holds per property per hour.
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

  -- Worst-case occupancy across the requested nights = max over nights of
  -- (overlapping real bookings of this type) + (maintenance close-outs).
  select coalesce(max(occ.cnt), 0) into v_max_blocked
  from generate_series(0, v_nights - 1) as gs(n)
  cross join lateral (
    select
      coalesce((
        select sum(
          case
            when jsonb_typeof(b.room_items) = 'array' and jsonb_array_length(b.room_items) > 0 then (
              select count(*) from jsonb_array_elements(b.room_items) ri
              where coalesce(ri->>'roomTypeId', b.room_category_code) = v_type
            )
            when b.room_category_code = v_type then 1
            else 0
          end
        )
        from bookings b
        where b.property_id = v_property_id
          and b.status <> 'cancelled'
          and b.start_date <= (v_start + gs.n)
          and (b.start_date + b.nights) > (v_start + gs.n)
      ), 0)
      +
      coalesce((
        select case when ro.closed_out then v_units
                    else coalesce(jsonb_array_length(ro.closed_units), 0) end
        from rate_overrides ro
        where ro.property_id = v_property_id
          and ro.room_category_code = v_type
          and ro.date = (v_start + gs.n)
        limit 1
      ), 0) as cnt
  ) occ;

  if v_max_blocked + v_rooms_needed > v_units then
    raise exception 'no_capacity' using errcode = 'P0001';
  end if;

  -- Allocate the LOWEST FREE unit index over the requested nights (mirrors the
  -- app's firstFreeUnit / computeUnitUsage). The previous code used the occupancy
  -- COUNT as the index, which could land on an already-occupied unit when units
  -- are booked non-contiguously. The capacity check above guarantees a free unit.
  v_unit := null;
  for v_u in 0 .. v_units - 1 loop
    if not exists (
      select 1 from bookings b
      where b.property_id = v_property_id
        and b.status <> 'cancelled'
        and b.room_category_code = v_type
        and b.unit_idx = v_u
        and b.start_date < (v_start + v_nights)
        and (b.start_date + b.nights) > v_start
    ) and not exists (
      select 1
      from generate_series(0, v_nights - 1) gs(n)
      join rate_overrides ro
        on ro.property_id = v_property_id
       and ro.room_category_code = v_type
       and ro.date = (v_start + gs.n)
      where ro.closed_out = true
         or (ro.closed_units is not null and ro.closed_units @> to_jsonb(v_u))
    ) then
      v_unit := v_u;
      exit;
    end if;
  end loop;
  if v_unit is null then
    v_unit := least(greatest(0, v_max_blocked), v_units - 1);  -- defensive fallback
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
    v_unit,
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
    v_total,
    0,
    coalesce((p_booking->>'gst_applies')::boolean, false),
    coalesce(p_booking->'extras', '{}'::jsonb),
    coalesce(p_booking->'custom_extras', '[]'::jsonb),
    coalesce(p_booking->'extra_prices', '{}'::jsonb),
    coalesce(p_booking->'room_items', '[]'::jsonb),
    coalesce(p_booking->>'meal_plan_id', 'ep'),
    coalesce(p_booking->>'rate_plan_id', 'standard'),
    coalesce(p_booking->'events', '[]'::jsonb),
    v_store_coupon,
    v_discount,
    (p_booking->>'release_ts')::bigint,
    p_booking->>'release_at',
    (p_booking->>'hold_hours')::int
  )
  returning id into v_new_id;

  -- (C) Redeem the coupon atomically with the insert — only when a real coupon
  -- applied. This is what makes maxUses actually count down.
  if v_coupon_ok then
    perform redeem_coupon(v_property_id, v_store_coupon);
  end if;

  return v_new_id;
end;
$$;
-- ⚠️ CAPTCHA LOCKDOWN (see 20260702_widget_captcha_lockdown.sql). Website bookings
-- must go through the serverless verifier (api/widget-book.js), which calls this
-- function with the SERVICE-ROLE key. Granting anon EXECUTE here would re-open the
-- direct booking bypass the CAPTCHA closes — and because this file DROPs+CREATEs
-- the function, a fresh CREATE also restores the default PUBLIC execute grant. So
-- instead of `grant ... to anon`, this migration now SELF-LOCKS: it strips PUBLIC
-- + anon + authenticated and leaves only service_role. Re-pasting this file is
-- therefore always safe — it can never re-open the bypass. (To deliberately
-- restore the pre-CAPTCHA open widget, use the revert block in 20260702.)
revoke execute on function public.book_widget_slot(jsonb) from public;
revoke execute on function public.book_widget_slot(jsonb) from anon;
revoke execute on function public.book_widget_slot(jsonb) from authenticated;
grant execute on function public.book_widget_slot(jsonb) to service_role;

-- Test (private / logged-out): with units 0 and 2 of a type booked for some dates
-- and unit 1 free, a website booking for those dates should land on unit_idx = 1
-- (the first free unit), not unit_idx = 2.
