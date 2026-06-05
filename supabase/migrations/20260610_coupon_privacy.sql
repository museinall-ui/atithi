-- Stop leaking the coupon book to anonymous visitors (round-9 R9-4).
--
-- property_by_short_code() (the anon RPC the public booking widget calls to
-- render the right hotel) returned the entire `coupons` jsonb — every code,
-- discount, usage cap and used-count — to anybody who hits /book/<slug>. So a
-- visitor could scrape unlaunched / staff-only codes and use them.
--
-- Fix:
--   1. Re-define property_by_short_code WITHOUT the coupons column.
--   2. Add validate_coupon(propertyId, code, nights) — a SECURITY DEFINER RPC
--      that checks ONE code server-side and returns just that coupon's
--      discount when valid, never the full list. The widget calls this when a
--      guest applies a code (cloud mode); demo mode still validates locally.
--
-- Owner-side action: paste this whole file into the Supabase SQL Editor and
-- click Run. Idempotent (drop + create). After running, property_by_short_code
-- no longer exposes coupons, and coupon entry on the live widget validates via
-- validate_coupon.

-- 1) Re-create the public property lookup WITHOUT coupons.
drop function if exists public.property_by_short_code(text);
create or replace function public.property_by_short_code(p_short_code text)
returns table(
  id uuid, name text, type text, city text, state text, theme jsonb,
  logo_data_url text, payment_qr_data_url text, payment_qr_label text,
  tagline text, photo_gallery jsonb, rules text[], meal_plans jsonb,
  default_meal_plan_id text, base_capacity_adults integer,
  rate_plans jsonb, weekend_rules jsonb, seasons jsonb,
  channel_markups jsonb, embed_button jsonb,
  short_code text, check_in text, check_out text, phone text
)
language sql security definer
set search_path = public as $$
  select id, name, type, city, state, theme,
         logo_data_url, payment_qr_data_url, payment_qr_label,
         tagline, photo_gallery, rules, meal_plans,
         default_meal_plan_id, base_capacity_adults,
         rate_plans, weekend_rules, seasons,
         channel_markups, embed_button,
         short_code, check_in, check_out, phone
  from properties
  where short_code = p_short_code
  limit 1;
$$;
grant execute on function public.property_by_short_code(text) to anon;
grant execute on function public.property_by_short_code(text) to authenticated;

-- 2) Validate a single coupon server-side. Returns the discount only when the
--    code is valid (enabled, not expired, meets min-nights, under max-uses).
--    Never returns the other codes. expiry compared in IST (Asia/Kolkata).
drop function if exists public.validate_coupon(uuid, text, integer);
create or replace function public.validate_coupon(p_property_id uuid, p_code text, p_nights integer)
returns jsonb
language plpgsql security definer
set search_path = public as $$
declare
  v jsonb;
  v_today text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
begin
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty');
  end if;
  select elem into v
  from properties p
  cross join lateral jsonb_array_elements(coalesce(p.coupons, '[]'::jsonb)) elem
  where p.id = p_property_id
    and upper(coalesce(elem->>'code', '')) = upper(btrim(p_code))
    and coalesce((elem->>'enabled')::boolean, true) = true
  limit 1;

  if v is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if coalesce(v->>'expiryIso', '') <> '' and (v->>'expiryIso') < v_today then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if coalesce((v->>'minNights')::int, 0) > coalesce(p_nights, 0) then
    return jsonb_build_object('ok', false, 'reason', 'minNights', 'minNights', coalesce((v->>'minNights')::int, 0));
  end if;
  if coalesce((v->>'maxUses')::int, 0) > 0
     and coalesce((v->>'usedCount')::int, 0) >= (v->>'maxUses')::int then
    return jsonb_build_object('ok', false, 'reason', 'maxUses');
  end if;
  return jsonb_build_object('ok', true, 'code', v->>'code', 'discount', v->'discount');
end;
$$;
grant execute on function public.validate_coupon(uuid, text, integer) to anon;
grant execute on function public.validate_coupon(uuid, text, integer) to authenticated;

-- Test:
--   select validate_coupon('<property uuid>', 'WELCOME10', 2);
-- → {"ok": true, "code": "WELCOME10", "discount": {...}} for a valid code,
--   {"ok": false, "reason": "invalid"} otherwise.
