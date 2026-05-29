-- Coupon redemption — atomically bump a coupon's usedCount.
--
-- The widget validates a coupon's `maxUses` against its `usedCount`
-- (src/screens/PublicBookingWidget.jsx) but nothing ever incremented
-- usedCount, so a "first 50 guests" coupon would discount forever.
-- This migration adds redeem_coupon(propertyId, code), called by the
-- widget right after a coupon-bearing booking is inserted.
--
-- Why an RPC (not a client-side update): the widget runs as the anon
-- role. Anon has a narrow INSERT-only policy on bookings and NO update
-- rights on the properties row. A SECURITY DEFINER function is the only
-- way the unauthenticated guest can record that they used the coupon,
-- and doing it in one UPDATE keeps the increment atomic (no read-modify-
-- write race between two guests checking out at the same time).
--
-- Scope / limitation: a malicious visitor could call redeem_coupon
-- directly to inflate a coupon's usedCount and exhaust it early. For a
-- small-hotel discount code this is low-stakes — the hotelier just bumps
-- maxUses or toggles the coupon off/on in Settings. We accept that
-- trade-off rather than build booking-linked redemption tracking.
--
-- Owner-side action: paste this whole file into the Supabase SQL Editor
-- and click Run. Idempotent (CREATE OR REPLACE + re-grantable) so
-- re-running is safe. Until it's run, the widget still works — the
-- redeem call is best-effort and swallows a missing-function error, so
-- coupons simply behave as they do today (usedCount stays 0).

drop function if exists public.redeem_coupon(uuid, text);
create or replace function public.redeem_coupon(p_property_id uuid, p_code text)
returns void
language plpgsql security definer
set search_path = public as $$
begin
  update properties
  set coupons = (
    select jsonb_agg(
      case
        when upper(coalesce(elem->>'code', '')) = upper(p_code)
          then jsonb_set(
            elem,
            '{usedCount}',
            to_jsonb(coalesce(nullif(elem->>'usedCount', '')::int, 0) + 1)
          )
        else elem
      end
    )
    from jsonb_array_elements(coupons) elem
  )
  where id = p_property_id
    and coupons is not null
    and jsonb_typeof(coupons) = 'array'
    and exists (
      select 1 from jsonb_array_elements(coupons) e
      where upper(coalesce(e->>'code', '')) = upper(p_code)
    );
end;
$$;
grant execute on function public.redeem_coupon(uuid, text) to anon;
grant execute on function public.redeem_coupon(uuid, text) to authenticated;

-- Test (replace the uuid + code):
--   select redeem_coupon('00000000-0000-0000-0000-000000000000', 'WELCOME10');
-- Then re-read the property and confirm the matching coupon's usedCount
-- went up by 1.
