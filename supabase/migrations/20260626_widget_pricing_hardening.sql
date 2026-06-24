-- ----------------------------------------------------------------------------
-- 20260626_widget_pricing_hardening.sql
-- Public booking widget — server-side PRICING integrity (follow-up to 20260616).
--
-- 20260616 hardened capacity / dates / close-outs / paid=0, but deliberately
-- left the booking TOTAL, the COUPON, and the MIN-STAY rule trusting the client
-- payload. The 2026-06-24 audit confirmed a hand-crafted RPC call could:
--   • apply a discount with a fake / expired / capped / non-existent coupon, or
--     an arbitrary discount_amount with no coupon at all;
--   • reuse a maxUses-capped coupon forever (redeem_coupon was a separate,
--     skippable, client-side best-effort call → usedCount might never bump);
--   • book a stay shorter than the hotelier's configured minimum nights.
--
-- This migration recreates book_widget_slot keeping EVERY existing guard and
-- adding three server-side checks:
--
--   (A) Minimum-night-stay — reads accountant.minNights (Advanced settings) and
--       raises `min_stay` when nights are below the applicable minimum. Mirrors
--       the widget UI: the weekend minimum applies when ANY night lands on a
--       weekend day (weekend_rules.weekendDays; both Postgres extract(dow) and
--       JS getDay() are 0=Sun..6=Sat), else the all-days minimum.
--
--   (B) Coupon validation + discount recompute — the discount is NO LONGER
--       taken from the client. We reconstruct the claimed pre-discount subtotal
--       (total + discount_amount), then trust ONLY a coupon that validate_coupon
--       (20260610) confirms is real, enabled, unexpired, meets min-nights and is
--       under maxUses. The discount is recomputed from THAT coupon's own rule
--       (flat → its value, pct → pct × subtotal), exactly like the widget. A
--       fake / invalid coupon (or a discount with no coupon) yields ZERO
--       discount and no stored code. The total is then recomputed as
--       subtotal − discount so the row is internally consistent.
--
--   (C) In-transaction redemption — when (and only when) a valid coupon applied,
--       redeem_coupon() runs INSIDE this function, atomically with the insert,
--       so maxUses actually counts down and the client can't skip or spam it.
--       (The widget's separate best-effort redeem_coupon call is removed in the
--       same change — see src/cloud/widget.js — to avoid double-counting.)
--
-- STILL client-quoted (accepted, documented): the BASE tariff (room rate ×
-- nights + meals + extras + extra-guest). Recomputing the whole pricing engine
-- in PL/pgSQL would duplicate weekend/season/override + meal + extras +
-- rate-plan + single-occ + extra-guest and drift from the JS. The booking lands
-- `tentative` + `paid = 0` and the hotelier reviews + confirms the price before
-- it becomes revenue, so a tampered base total shows a wrong number on a held
-- booking they vet — not a confirmed sale. The discount / coupon / min-stay
-- holes above ARE now closed because they don't need the full engine.
--
-- Owner-side action: paste into the Supabase SQL Editor + Run. Idempotent
-- (DROP + CREATE OR REPLACE). Safe to re-run. Requires 20260610 (validate_coupon)
-- + 20260606 (redeem_coupon) to already be installed.
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

  -- Next free slot index (count-based, consistent with the capacity check).
  v_unit := least(greatest(0, v_max_blocked), v_units - 1);

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
  -- applied. This is what makes maxUses actually count down (and not be
  -- skippable / spammable from the client).
  if v_coupon_ok then
    perform redeem_coupon(v_property_id, v_store_coupon);
  end if;

  return v_new_id;
end;
$$;
grant execute on function public.book_widget_slot(jsonb) to anon;
grant execute on function public.book_widget_slot(jsonb) to authenticated;

-- Test in a PRIVATE / logged-out window before sharing the link:
--   1. Fake coupon gives no discount (total ends == subtotal):
--        select book_widget_slot(jsonb_build_object(
--          'property_id','<uuid>','room_category_code','dlx',
--          'start_date', to_char(current_date + 5,'YYYY-MM-DD'),'nights',2,
--          'total', 100, 'discount_amount', 9000, 'coupon_code','NOTREAL'));
--      → row inserts with total=9100, discount_amount=0, coupon_code=''.
--   2. A real % coupon recomputes the discount from the subtotal, not the
--      client's number, and its usedCount goes up by 1.
--   3. nights below a configured weekend minimum raises `min_stay`.
