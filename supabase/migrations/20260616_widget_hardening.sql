-- ----------------------------------------------------------------------------
-- 20260616_widget_hardening.sql
-- Public booking widget — pre-launch server-side hardening.
--
-- Supersedes book_widget_slot from 20260607 (capacity) and 20260612 (flood
-- cap): keeps BOTH of those guards and adds four more, so the widget is safe
-- to expose to untrusted public traffic:
--
--   1. Date floor — reject holds for dates before yesterday (server-side), so
--      a tampered request can't create past-dated clutter. (current_date - 1
--      tolerates the IST-vs-UTC day edge.)
--   2. Close-out enforcement — the capacity check now also subtracts
--      maintenance close-outs (rate_overrides.closed_out / closed_units) for
--      each requested night, so a tampered request can't book a date/room the
--      hotelier deliberately blocked. (rate_overrides stores real DATEs, so
--      this maps cleanly server-side — the old "no stable date mapping" note
--      on 20260607 was overly cautious.)
--   3. Unit allocation — assign the next free slot index (count-based, in step
--      with the count-based capacity check) instead of always unit 0, so
--      concurrent website bookings stop stacking on unit #1 in the diary.
--   4. paid forced 0 + total/discount clamped to >= 0 (discount <= total) — a
--      tampered payload can't claim money paid or push a negative total.
--
-- Also re-creates the fallback anon INSERT policy with `paid = 0` so even the
-- non-RPC insert path can't record a fake payment.
--
-- NOT done here (deliberately deferred): a full server-side recompute of the
-- booking TOTAL from room type + dates + validated coupon. That means
-- duplicating the app's whole pricing engine (weekend/season/override + meal +
-- extras + rate-plan + extra-guest + coupon) in PL/pgSQL — large and
-- error-prone. The booking lands as `tentative` + `paid = 0`, and the hotelier
-- reviews + confirms it (seeing the price) before it becomes real revenue, so a
-- tampered total shows a wrong number on a held booking the hotelier vets, not
-- a confirmed sale. Revisit if the widget ever auto-confirms.
--
-- Owner-side action: paste into the Supabase SQL Editor + Run before sharing
-- the public booking link. Idempotent (DROP + CREATE OR REPLACE). Test in a
-- private window first (see the bottom of the file).
-- ----------------------------------------------------------------------------

drop function if exists public.book_widget_slot(jsonb);
create or replace function public.book_widget_slot(p_booking jsonb)
returns text
language plpgsql security definer
set search_path = public as $$
declare
  v_property_id  uuid := (p_booking->>'property_id')::uuid;
  v_type         text := p_booking->>'room_category_code';
  v_start        date := (p_booking->>'start_date')::date;
  v_nights       int  := greatest(1, coalesce((p_booking->>'nights')::int, 1));
  v_rooms_needed int;
  v_units        int;
  v_max_blocked  int;
  v_recent       int;
  v_unit         int;
  v_total        int  := greatest(0, coalesce((p_booking->>'total')::int, 0));
  v_discount     int  := greatest(0, coalesce((p_booking->>'discount_amount')::int, 0));
  v_new_id       text;
  c_window_cap   constant int := 40;  -- max website holds per property per rolling hour
begin
  if v_property_id is null or v_type is null or v_start is null then
    raise exception 'bad_request' using errcode = 'P0001';
  end if;

  -- (1) Date floor — no past-dated holds (yesterday tolerated for TZ edge).
  if v_start < current_date - 1 then
    raise exception 'past_date' using errcode = 'P0001';
  end if;

  -- A discount can never exceed the (clamped) total.
  v_discount := least(v_discount, v_total);

  v_rooms_needed := greatest(1, coalesce(
    case when jsonb_typeof(p_booking->'room_items') = 'array'
         then jsonb_array_length(p_booking->'room_items') end, 1));

  -- Flood guard (20260612): bound website holds per property per hour. Cheap
  -- pre-check before the advisory lock.
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
  -- (overlapping real bookings of this type) + (maintenance close-outs for
  -- that night: whole-type close → all units; else the count of closed_units).
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

  -- (3) Next free slot index (count-based, consistent with the capacity check)
  -- so concurrent website bookings don't all land on unit 0. Clamped to a
  -- valid index for safety.
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
    coalesce(p_booking->>'coupon_code', ''),
    v_discount,
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

-- Re-create the fallback anon INSERT policy with `paid = 0` so even the
-- non-RPC path (used only if the RPC is somehow missing) can't record a fake
-- payment. status/channel constraints unchanged.
drop policy if exists "anon insert widget bookings" on bookings;
create policy "anon insert widget bookings" on bookings
  for insert to anon
  with check (status = 'tentative' and channel = 'website' and coalesce(paid, 0) = 0);

-- Test in a PRIVATE / logged-out window before sharing the link:
--   1. Past date is rejected:
--        select book_widget_slot(jsonb_build_object(
--          'property_id','<uuid>','room_category_code','dlx',
--          'start_date','2020-01-01','nights',1));   -- expect: past_date
--   2. A maintenance-closed date is rejected (close it in Rates first):
--        ... start_date = the closed date ...        -- expect: no_capacity
--   3. A normal future date returns a BK-XXXX id and lands in the diary with a
--      non-zero unit_idx when another website booking already holds unit 0.
